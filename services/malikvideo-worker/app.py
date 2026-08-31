from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

APP_NAME = "MalikVideo Worker"
DATA_DIR = Path(os.getenv("MALIKVIDEO_DATA_DIR", "/data/malikvideo")).resolve()
DB_PATH = DATA_DIR / "jobs.sqlite3"
H3_BASE_URL = os.getenv("MALIKVIDEO_UPSTREAM_H3_URL", "http://127.0.0.1:30010").rstrip("/")
API_KEY = os.getenv("MALIKVIDEO_WORKER_API_KEY", "").strip()
ENHANCER = os.getenv("MALIKVIDEO_ENHANCER", "seedvr2").strip().lower()
SEEDVR_ROOT = Path(os.getenv("MALIKVIDEO_SEEDVR_ROOT", "/opt/SeedVR")).resolve()
SEEDVR_GPUS = max(1, int(os.getenv("MALIKVIDEO_SEEDVR_GPUS", "4")))
SEEDVR_SCRIPT = os.getenv("MALIKVIDEO_SEEDVR_SCRIPT", "projects/inference_seedvr2_3b.py")
FFMPEG = os.getenv("FFMPEG_BIN", "ffmpeg")
POLL_SECONDS = max(2, int(os.getenv("MALIKVIDEO_POLL_SECONDS", "5")))
HTTP_TIMEOUT = float(os.getenv("MALIKVIDEO_HTTP_TIMEOUT_SECONDS", "30"))

DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title=APP_NAME, version="1.0.0")
_stop = threading.Event()
_worker_thread: threading.Thread | None = None


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
                h3_id TEXT,
                state TEXT NOT NULL,
                request_json TEXT NOT NULL,
                output_resolution TEXT NOT NULL,
                source_path TEXT,
                final_path TEXT,
                error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )


def require_auth(authorization: str | None) -> None:
    if not API_KEY:
        return
    if authorization != f"Bearer {API_KEY}":
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
    values = [fields[k] for k in keys]
    assignments = ", ".join(f"{k} = ?" for k in keys)
    with db() as conn:
        conn.execute(f"UPDATE jobs SET {assignments} WHERE id = ?", (*values, job_id))


def normalized_output_resolution(value: str) -> str:
    v = value.strip().lower().replace("1440p", "2k")
    if v in {"raw", "raw768", "768p", "720p"}:
        return "raw768"
    if v in {"1080", "1080p", "fhd"}:
        return "1080p"
    if v in {"2k", "qhd", "2560x1440"}:
        return "2k"
    raise HTTPException(status_code=400, detail=f"unsupported output_resolution: {value}")


def target_dimensions(output_resolution: str, ratio: str) -> tuple[int, int]:
    if output_resolution == "1080p":
        landscape = (1920, 1080)
        square = (1080, 1080)
    else:
        landscape = (2560, 1440)
        square = (1440, 1440)
    if ratio == "9:16":
        return landscape[1], landscape[0]
    if ratio == "1:1":
        return square
    return landscape


def h3_headers() -> dict[str, str]:
    token = os.getenv("MALIKVIDEO_UPSTREAM_H3_API_KEY", "").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}


def submit_h3(req: VideoRequest) -> str:
    body = req.model_dump(exclude={"output_resolution", "metadata"})
    target = dict(body.get("target") or {})
    target["short_edge"] = 768
    target.setdefault("aspect_ratio", "16:9")
    target.setdefault("duration_seconds", 5)
    body["target"] = target
    with httpx.Client(timeout=HTTP_TIMEOUT, headers=h3_headers()) as client:
        response = client.post(f"{H3_BASE_URL}/v1/videos", json=body)
        response.raise_for_status()
        payload = response.json()
    h3_id = payload.get("id") or payload.get("video_id") or payload.get("task_id")
    if not h3_id:
        raise RuntimeError("H3 returned no video id")
    return str(h3_id)


def h3_status(h3_id: str) -> tuple[str, dict[str, Any]]:
    with httpx.Client(timeout=HTTP_TIMEOUT, headers=h3_headers()) as client:
        response = client.get(f"{H3_BASE_URL}/v1/videos/{h3_id}")
        response.raise_for_status()
        payload = response.json()
    raw = str(payload.get("status") or payload.get("state") or "").lower()
    if raw in {"completed", "complete", "succeeded", "success", "done"}:
        return "completed", payload
    if raw in {"failed", "error", "cancelled", "canceled"}:
        return "failed", payload
    return "generating", payload


def download_h3(job_id: str, h3_id: str) -> Path:
    job_dir = DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    destination = job_dir / "h3-master.mp4"
    temp = destination.with_suffix(".part")
    with httpx.Client(timeout=None, headers=h3_headers()) as client:
        with client.stream("GET", f"{H3_BASE_URL}/v1/videos/{h3_id}/content") as response:
            response.raise_for_status()
            with temp.open("wb") as fh:
                for chunk in response.iter_bytes():
                    fh.write(chunk)
    temp.replace(destination)
    return destination


def run_seedvr2(job_id: str, source: Path, output_resolution: str, ratio: str, seed: int) -> Path:
    if ENHANCER != "seedvr2":
        raise RuntimeError(f"enhancer '{ENHANCER}' cannot produce {output_resolution}")
    script = SEEDVR_ROOT / SEEDVR_SCRIPT
    if not script.exists():
        raise RuntimeError(f"SeedVR2 script missing: {script}")
    if shutil.which("torchrun") is None:
        raise RuntimeError("torchrun is not installed")
    if shutil.which(FFMPEG) is None:
        raise RuntimeError("ffmpeg is not installed")

    width, height = target_dimensions(output_resolution, ratio)
    job_dir = DATA_DIR / job_id
    input_dir = job_dir / "seedvr-input"
    output_dir = job_dir / "seedvr-output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    staged = input_dir / "input.mp4"
    if not staged.exists():
        try:
            os.link(source, staged)
        except OSError:
            shutil.copy2(source, staged)

    command = [
        "torchrun",
        f"--nproc-per-node={SEEDVR_GPUS}",
        str(script),
        "--video_path",
        str(input_dir),
        "--output_dir",
        str(output_dir),
        "--seed",
        str(seed),
        "--res_h",
        str(height),
        "--res_w",
        str(width),
        "--sp_size",
        str(SEEDVR_GPUS),
    ]
    subprocess.run(command, cwd=SEEDVR_ROOT, check=True)

    candidates = sorted(output_dir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        raise RuntimeError("SeedVR2 completed but produced no mp4")
    restored = candidates[0]
    final = job_dir / f"final-{output_resolution}.mp4"
    temp = final.with_suffix(".part.mp4")

    # SeedVR2 restores video frames. Keep H3's synchronized soundtrack by muxing
    # audio from the original master back into the restored frames.
    subprocess.run(
        [
            FFMPEG,
            "-y",
            "-i",
            str(restored),
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-map",
            "1:a?",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(temp),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    temp.replace(final)
    return final


def process_job(row: sqlite3.Row) -> None:
    job_id = row["id"]
    request = json.loads(row["request_json"])
    output_resolution = row["output_resolution"]
    state = row["state"]

    if state in {"queued", "generating"}:
        status, payload = h3_status(row["h3_id"])
        if status == "failed":
            update_job(job_id, state="failed", error=str(payload.get("error") or payload.get("message") or "H3 generation failed"))
            return
        if status != "completed":
            if state != "generating":
                update_job(job_id, state="generating")
            return
        source = download_h3(job_id, row["h3_id"])
        update_job(job_id, state="source_ready", source_path=str(source))
        state = "source_ready"

    if state == "source_ready":
        source = Path(get_job(job_id)["source_path"])
        if output_resolution == "raw768":
            update_job(job_id, state="completed", final_path=str(source))
            return
        update_job(job_id, state="enhancing")
        ratio = str((request.get("target") or {}).get("aspect_ratio") or "16:9")
        seed = int(request.get("seed") or 0)
        final = run_seedvr2(job_id, source, output_resolution, ratio, seed)
        update_job(job_id, state="completed", final_path=str(final))


def processing_loop() -> None:
    while not _stop.is_set():
        try:
            with db() as conn:
                rows = conn.execute(
                    "SELECT * FROM jobs WHERE state IN ('queued','generating','source_ready') ORDER BY created_at ASC LIMIT 4"
                ).fetchall()
            for row in rows:
                if _stop.is_set():
                    break
                try:
                    process_job(row)
                except Exception as exc:  # recovery is explicit; no silent fake success
                    update_job(row["id"], state="failed", error=f"{type(exc).__name__}: {exc}")
        except Exception:
            pass
        _stop.wait(POLL_SECONDS)


@app.on_event("startup")
def startup() -> None:
    global _worker_thread
    init_db()
    _stop.clear()
    _worker_thread = threading.Thread(target=processing_loop, name="malikvideo-worker", daemon=True)
    _worker_thread.start()


@app.on_event("shutdown")
def shutdown() -> None:
    _stop.set()
    if _worker_thread:
        _worker_thread.join(timeout=5)


@app.get("/health")
def health() -> dict[str, Any]:
    seedvr_ready = (SEEDVR_ROOT / SEEDVR_SCRIPT).exists() and shutil.which("torchrun") is not None
    return {
        "ok": True,
        "service": APP_NAME,
        "h3_upstream": H3_BASE_URL,
        "enhancer": ENHANCER,
        "seedvr_ready": seedvr_ready,
        "supported_outputs": ["raw768", "1080p", "2k"] if seedvr_ready and ENHANCER == "seedvr2" else ["raw768"],
    }


@app.post("/v1/videos")
def create_video(req: VideoRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    output_resolution = normalized_output_resolution(req.output_resolution)
    if output_resolution != "raw768" and ENHANCER == "none":
        raise HTTPException(status_code=503, detail="1080p/2K enhancer is not configured")
    try:
        h3_id = submit_h3(req)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"H3 submit failed: {exc}") from exc
    job_id = uuid.uuid4().hex
    timestamp = now()
    with db() as conn:
        conn.execute(
            "INSERT INTO jobs(id,h3_id,state,request_json,output_resolution,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            (job_id, h3_id, "queued", req.model_dump_json(), output_resolution, timestamp, timestamp),
        )
    return {"id": job_id, "status": "queued", "model": "MalikVideo-1.0", "output_resolution": output_resolution}


@app.get("/v1/videos/{job_id}")
def video_status(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    row = get_job(job_id)
    state = row["state"]
    public = "completed" if state == "completed" else "failed" if state == "failed" else "processing" if state in {"generating", "source_ready", "enhancing"} else "queued"
    return {
        "id": job_id,
        "status": public,
        "stage": state,
        "model": "MalikVideo-1.0",
        "output_resolution": row["output_resolution"],
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
    path = Path(row["final_path"])
    if not path.exists():
        raise HTTPException(status_code=410, detail="final video file is missing")
    return FileResponse(path, media_type="video/mp4", filename=f"malikvideo-{job_id}.mp4")
