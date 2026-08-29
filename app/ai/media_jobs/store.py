from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List


BASE_DIR = Path(__file__).resolve().parents[3]
STORE_PATH = Path(
    os.environ.get(
        "MALIK_MEDIA_JOB_STORE_PATH",
        # Job inputs can contain private user prompts. Keep this outside Flask's
        # public /static tree; only the authenticated/status API exposes the
        # minimal public job projection.
        str(BASE_DIR / "app" / "data" / "media_jobs.json"),
    )
)
MAX_JOBS = 500
_LOCK = threading.RLock()


def _load_jobs() -> Dict[str, Dict[str, Any]]:
    try:
        if not STORE_PATH.exists():
            return {}
        payload = json.loads(STORE_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        return {
            str(job_id): job
            for job_id, job in payload.items()
            if isinstance(job, dict)
        }
    except Exception:
        return {}


_JOBS: Dict[str, Dict[str, Any]] = _load_jobs()


def _save_jobs() -> None:
    try:
        STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = STORE_PATH.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(_JOBS, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.replace(STORE_PATH)
    except Exception:
        # The in-memory copy still keeps the job alive if disk persistence is
        # temporarily unavailable.
        pass


def _trim() -> None:
    if len(_JOBS) <= MAX_JOBS:
        return
    oldest = sorted(_JOBS.values(), key=lambda job: job.get("updatedAt", 0))[: len(_JOBS) - MAX_JOBS]
    for job in oldest:
        _JOBS.pop(str(job.get("id") or ""), None)


def create_job(job_type: str, input_data: dict) -> dict:
    now = time.time()
    job = {
        "id": f"job_{job_type}_{uuid.uuid4().hex[:16]}",
        "type": job_type,
        "status": "queued",
        "progress": 6,
        "input": input_data,
        "output": None,
        "error": None,
        "provider": input_data.get("provider", "auto"),
        "model": input_data.get("modelId") or None,
        "createdAt": now,
        "updatedAt": now,
    }
    with _LOCK:
        _JOBS[job["id"]] = job
        _trim()
        _save_jobs()
        return dict(job)


def update_job(job_id: str, **patch) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        job.update(patch)
        job["updatedAt"] = time.time()
        _save_jobs()
        return dict(job)


def get_job(job_id: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None


def list_jobs(user_id: str | None = None) -> List[dict]:
    with _LOCK:
        jobs = [dict(job) for job in _JOBS.values()]
    if user_id:
        jobs = [
            job
            for job in jobs
            if job.get("input", {}).get("userId") == user_id
            or job.get("input", {}).get("userEmail") == user_id
        ]
    return sorted(jobs, key=lambda job: job.get("updatedAt", 0), reverse=True)[:100]
