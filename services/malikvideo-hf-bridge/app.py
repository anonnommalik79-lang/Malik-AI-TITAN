from __future__ import annotations

import json
import os
import shutil
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from gradio_client import Client
from pydantic import BaseModel, Field

APP_NAME = "MalikVideo HF Bridge"
DATA_DIR = Path(os.getenv("MALIKVIDEO_DATA_DIR", "/tmp/malikvideo-hf")).resolve()
DB_PATH = DATA_DIR / "jobs.sqlite3"
API_KEY = os.getenv("MALIKVIDEO_WORKER_API_KEY", "").strip()
HF_TOKEN = os.getenv("HF_TOKEN", "").strip()
HF_SPACE = os.getenv("MALIKVIDEO_HF_SPACE", "ks2047/minimax-h3").strip()
HF_DURATION = max(2, min(14, int(os.getenv("MALIKVIDEO_HF_DURATION", "5"))))
HF_STEPS = max(10, min(40, int(os.getenv("MALIKVIDEO_HF_STEPS", "20"))))
HF_SEED = int(os.getenv("MALIKVIDEO_HF_SEED", "42"))
POLL_SECONDS = max(1, int(os.getenv("MALIKVIDEO_POLL_SECONDS", "2")))

CANVAS_BY_RATIO = {
    "16:9": os.getenv("MALIKVIDEO_HF_CANVAS_16_9", "1024x576 · 16:9 fast"),
    "9:16": os.getenv("MALIKVIDEO_HF_CANVAS_9_16", "544x960 · 9:16 fast"),
    "1:1": os.getenv("MALIKVIDEO_HF_CANVAS_1_1", "544x544 · 1:1 fast"),
    "4:3": os.getenv("MALIKVIDEO_HF_CANVAS_4_3", "768x576 · 4:3 fast"),
}

DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title=APP_NAME, version="1.0.0")
_stop = threading.Event()
_worker: threading.Thread | None = None


class VideoRequest(BaseModel):
    task: str = "t2va"
    prompt: str = Field(min_length=1, max_length=12000)
    conditions: list[dict[str, Any]] = Field(default_factory=list)
    target: dict[str, Any] = Field(default_factory=dict)
    seed: int = 0
    output_resolution: str = "raw768"
    metadata: dict[str, Any] = Field(default_factory=dict)


def now() -> int:
    return int(time.time())


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                request_json TEXT NOT NULL,
                final_path TEXT,
                error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        # A bridge restart must not strand a request forever in `generating`.
        conn.execute("UPDATE jobs SET state='queued', updated_at=? WHERE state='generating'", (now(),))


def require_auth(authorization: str | None) -> None:
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


def get_job(job_id: str) -> sqlite3.Row:
    with db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="video job not found")
    return row


def update_job(job_id: str, **fields: Any) -> None:
    fields["updated_at"] = now()
    keys = list(fields)
    assignments = ", ".join(f"{key} = ?" for key in keys)
    values = [fields[key] for key in keys]
    with db() as conn:
        conn.execute(f"UPDATE jobs SET {assignments} WHERE id = ?", (*values, job_id))


def find_video(obj: Any) -> Path | None:
    if obj is None:
        return None
    if isinstance(obj, str):
        path = Path(obj)
        if path.exists() and path.suffix.lower() in {".mp4", ".webm", ".mov"}:
            return path
        return None
    if isinstance(obj, dict):
        for value in obj.values():
            found = find_video(value)
            if found:
                return found
        return None
    if isinstance(obj, (list, tuple)):
        for value in obj:
            found = find_video(value)
            if found:
                return found
        return None
    path_value = getattr(obj, "path", None)
    if path_value:
        path = Path(str(path_value))
        if path.exists() and path.suffix.lower() in {".mp4", ".webm", ".mov"}:
            return path
    return None


def run_hf_generation(job_id: str, request: VideoRequest) -> Path:
    if not HF_TOKEN.startswith("hf_"):
        raise RuntimeError("HF_TOKEN is missing or invalid")

    ratio = str(request.target.get("aspect_ratio") or "16:9")
    canvas = CANVAS_BY_RATIO.get(ratio, CANVAS_BY_RATIO["16:9"])
    requested_duration = int(request.target.get("duration_seconds") or HF_DURATION)
    duration = min(HF_DURATION, max(2, requested_duration))
    seed = request.seed if request.seed else HF_SEED

    # This bridge intentionally exposes the free H3 master only. 1080p/2K must
    # use the dedicated MalikVideo enhancer path instead of relabelling a lower
    # resolution result as high resolution.
    normalized = request.output_resolution.strip().lower()
    if normalized not in {"raw", "raw768", "720p", "768p"}:
        raise RuntimeError("HF ZeroGPU MalikVideo 1.0 supports the raw/720p tier only")

    job_dir = DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    client = Client(
        HF_SPACE,
        token=HF_TOKEN,
        download_files=str(job_dir),
        verbose=False,
        httpx_kwargs={
            "timeout": httpx.Timeout(connect=30.0, read=240.0, write=60.0, pool=60.0)
        },
    )

    result = client.predict(
        request.prompt,
        None,
        None,
        canvas,
        duration,
        HF_STEPS,
        seed,
        api_name="/generate",
    )

    source = find_video(result)
    if source is None:
        raise RuntimeError(f"MiniMax H3 returned no downloadable video: {result!r}")

    final_path = job_dir / "malikvideo-1.0.mp4"
    if source.resolve() != final_path.resolve():
        shutil.copy2(source, final_path)
    if not final_path.exists() or final_path.stat().st_size <= 0:
        raise RuntimeError("MiniMax H3 produced an empty video file")
    return final_path


def processing_loop() -> None:
    while not _stop.is_set():
        row: sqlite3.Row | None = None
        try:
            with db() as conn:
                row = conn.execute(
                    "SELECT * FROM jobs WHERE state='queued' ORDER BY created_at ASC LIMIT 1"
                ).fetchone()
            if row:
                job_id = str(row["id"])
                update_job(job_id, state="generating", error=None)
                try:
                    request = VideoRequest.model_validate_json(row["request_json"])
                    final = run_hf_generation(job_id, request)
                    update_job(job_id, state="completed", final_path=str(final), error=None)
                except Exception as exc:
                    update_job(job_id, state="failed", error=f"{type(exc).__name__}: {exc}")
        except Exception:
            pass
        _stop.wait(POLL_SECONDS if row is None else 0.2)


@app.on_event("startup")
def startup() -> None:
    global _worker
    init_db()
    _stop.clear()
    _worker = threading.Thread(target=processing_loop, name="malikvideo-hf", daemon=True)
    _worker.start()


@app.on_event("shutdown")
def shutdown() -> None:
    _stop.set()
    if _worker:
        _worker.join(timeout=5)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "ready": HF_TOKEN.startswith("hf_"),
        "service": APP_NAME,
        "backend": "huggingface-zerogpu",
        "space": HF_SPACE,
        "model": "MalikVideo 1.0",
        "native_audio": True,
        "duration_seconds": HF_DURATION,
        "steps": HF_STEPS,
        "supported_outputs": ["raw768"],
    }


@app.post("/v1/videos")
def create_video(request: VideoRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    if not HF_TOKEN.startswith("hf_"):
        raise HTTPException(status_code=503, detail="HF_TOKEN is not configured")
    normalized = request.output_resolution.strip().lower()
    if normalized not in {"raw", "raw768", "720p", "768p"}:
        raise HTTPException(status_code=503, detail="MalikVideo HF bridge supports only the free 720p/raw tier")

    job_id = uuid.uuid4().hex
    timestamp = now()
    with db() as conn:
        conn.execute(
            "INSERT INTO jobs(id,state,request_json,created_at,updated_at) VALUES(?,?,?,?,?)",
            (job_id, "queued", request.model_dump_json(), timestamp, timestamp),
        )
    return {
        "id": job_id,
        "status": "queued",
        "model": "MalikVideo 1.0",
        "output_resolution": "raw768",
    }


@app.get("/v1/videos/{job_id}")
def video_status(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    row = get_job(job_id)
    state = str(row["state"])
    public = "completed" if state == "completed" else "failed" if state == "failed" else "processing" if state == "generating" else "queued"
    return {
        "id": job_id,
        "status": public,
        "stage": state,
        "model": "MalikVideo 1.0",
        "output_resolution": "raw768",
        "error": row["error"],
    }


@app.get("/v1/videos/{job_id}/content")
def video_content(job_id: str, authorization: str | None = Header(default=None)) -> FileResponse:
    require_auth(authorization)
    row = get_job(job_id)
    if row["state"] == "failed":
        raise HTTPException(status_code=409, detail=row["error"] or "generation failed")
    if row["state"] != "completed" or not row["final_path"]:
        raise HTTPException(status_code=409, detail=f"video not ready; stage={row['state']}")
    path = Path(str(row["final_path"]))
    if not path.exists():
        raise HTTPException(status_code=410, detail="final video file is missing")
    return FileResponse(path, media_type="video/mp4", filename=f"malikvideo-{job_id}.mp4")
