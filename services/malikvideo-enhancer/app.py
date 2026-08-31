from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

DATA_DIR = Path(os.getenv("MALIKVIDEO_ENHANCER_DATA_DIR", "/data/malikvideo-enhancer")).resolve()
DB_PATH = DATA_DIR / "jobs.sqlite3"
API_KEY = os.getenv("MALIKVIDEO_ENHANCER_API_KEY", "").strip()
SEEDVR_ROOT = Path(os.getenv("MALIKVIDEO_SEEDVR_ROOT", "/opt/SeedVR")).resolve()
SEEDVR_GPUS = max(1, int(os.getenv("MALIKVIDEO_SEEDVR_GPUS", "4")))
SEEDVR_SCRIPT = os.getenv("MALIKVIDEO_SEEDVR_SCRIPT", "projects/inference_seedvr2_3b.py")
POLL_SECONDS = max(1, int(os.getenv("MALIKVIDEO_ENHANCER_POLL_SECONDS", "2")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="MalikVideo Enhancer", version="1.0.0")
_stop = threading.Event()
_thread: threading.Thread | None = None


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
                input_path TEXT NOT NULL,
                output_path TEXT,
                resolution TEXT NOT NULL,
                ratio TEXT NOT NULL,
                seed INTEGER NOT NULL,
                error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )


def require_auth(authorization: str | None) -> None:
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


def get_job(job_id: str) -> sqlite3.Row:
    with db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="enhancement job not found")
    return row


def update_job(job_id: str, **fields: Any) -> None:
    fields["updated_at"] = now()
    keys = list(fields)
    values = [fields[k] for k in keys]
    with db() as conn:
        conn.execute(
            f"UPDATE jobs SET {', '.join(f'{k} = ?' for k in keys)} WHERE id = ?",
            (*values, job_id),
        )


def dimensions(resolution: str, ratio: str) -> tuple[int, int]:
    if resolution == "1080p":
        landscape = (1920, 1080)
        square = (1080, 1080)
    elif resolution == "2k":
        landscape = (2560, 1440)
        square = (1440, 1440)
    else:
        raise RuntimeError(f"unsupported resolution: {resolution}")
    if ratio == "9:16":
        return landscape[1], landscape[0]
    if ratio == "1:1":
        return square
    return landscape


def run_seedvr(row: sqlite3.Row) -> Path:
    script = SEEDVR_ROOT / SEEDVR_SCRIPT
    if not script.exists():
        raise RuntimeError(f"SeedVR2 script missing: {script}")
    if shutil.which("torchrun") is None:
        raise RuntimeError("torchrun is not installed")

    job_dir = DATA_DIR / row["id"]
    input_dir = job_dir / "input"
    output_dir = job_dir / "output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    staged = input_dir / "input.mp4"
    source = Path(row["input_path"])
    if not staged.exists():
        try:
            os.link(source, staged)
        except OSError:
            shutil.copy2(source, staged)

    width, height = dimensions(row["resolution"], row["ratio"])
    command = [
        "torchrun",
        f"--nproc-per-node={SEEDVR_GPUS}",
        str(script),
        "--video_path",
        str(input_dir),
        "--output_dir",
        str(output_dir),
        "--seed",
        str(row["seed"]),
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
        raise RuntimeError("SeedVR2 produced no mp4")
    final = job_dir / f"restored-{row['resolution']}.mp4"
    shutil.copy2(candidates[0], final)
    return final


def loop() -> None:
    while not _stop.is_set():
        try:
            with db() as conn:
                row = conn.execute("SELECT * FROM jobs WHERE state = 'queued' ORDER BY created_at ASC LIMIT 1").fetchone()
            if row:
                update_job(row["id"], state="enhancing")
                try:
                    output = run_seedvr(row)
                    update_job(row["id"], state="completed", output_path=str(output))
                except Exception as exc:
                    update_job(row["id"], state="failed", error=f"{type(exc).__name__}: {exc}")
        except Exception:
            pass
        _stop.wait(POLL_SECONDS)


@app.on_event("startup")
def startup() -> None:
    global _thread
    init_db()
    _stop.clear()
    _thread = threading.Thread(target=loop, name="malikvideo-enhancer", daemon=True)
    _thread.start()


@app.on_event("shutdown")
def shutdown() -> None:
    _stop.set()
    if _thread:
        _thread.join(timeout=5)


@app.get("/health")
def health() -> dict[str, Any]:
    ready = (SEEDVR_ROOT / SEEDVR_SCRIPT).exists() and shutil.which("torchrun") is not None
    return {
        "ok": True,
        "service": "MalikVideo Enhancer",
        "backend": "seedvr2",
        "ready": ready,
        "gpus": SEEDVR_GPUS,
        "supported_outputs": ["1080p", "2k"] if ready else [],
    }


@app.post("/v1/enhance")
async def enhance(
    video: UploadFile = File(...),
    resolution: str = Form("1080p"),
    ratio: str = Form("16:9"),
    seed: int = Form(0),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_auth(authorization)
    resolution = resolution.strip().lower().replace("1440p", "2k")
    if resolution not in {"1080p", "2k"}:
        raise HTTPException(status_code=400, detail="resolution must be 1080p or 2k")
    if ratio not in {"16:9", "9:16", "1:1"}:
        raise HTTPException(status_code=400, detail="unsupported ratio")

    job_id = uuid.uuid4().hex
    job_dir = DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    input_path = job_dir / "source.mp4"
    with input_path.open("wb") as out:
        while chunk := await video.read(1024 * 1024):
            out.write(chunk)

    timestamp = now()
    with db() as conn:
        conn.execute(
            "INSERT INTO jobs(id,state,input_path,resolution,ratio,seed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
            (job_id, "queued", str(input_path), resolution, ratio, int(seed), timestamp, timestamp),
        )
    return {"id": job_id, "status": "queued", "resolution": resolution}


@app.get("/v1/enhance/{job_id}")
def status(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    row = get_job(job_id)
    public = "completed" if row["state"] == "completed" else "failed" if row["state"] == "failed" else "processing" if row["state"] == "enhancing" else "queued"
    return {"id": job_id, "status": public, "stage": row["state"], "resolution": row["resolution"], "error": row["error"]}


@app.get("/v1/enhance/{job_id}/content")
def content(job_id: str, authorization: str | None = Header(default=None)) -> FileResponse:
    require_auth(authorization)
    row = get_job(job_id)
    if row["state"] == "failed":
        raise HTTPException(status_code=409, detail=row["error"] or "enhancement failed")
    if row["state"] != "completed" or not row["output_path"]:
        raise HTTPException(status_code=409, detail=f"not ready; stage={row['state']}")
    path = Path(row["output_path"])
    if not path.exists():
        raise HTTPException(status_code=410, detail="restored file missing")
    return FileResponse(path, media_type="video/mp4", filename=f"malikvideo-restored-{job_id}.mp4")
