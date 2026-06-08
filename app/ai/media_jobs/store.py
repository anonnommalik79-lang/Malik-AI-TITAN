from __future__ import annotations
import time
import uuid
from typing import Any, Dict, List

_JOBS: Dict[str, Dict[str, Any]] = {}
MAX_JOBS = 500

def _trim():
    if len(_JOBS) <= MAX_JOBS:
        return
    oldest = sorted(_JOBS.values(), key=lambda job: job["updatedAt"])[: len(_JOBS) - MAX_JOBS]
    for job in oldest:
        _JOBS.pop(job["id"], None)

def create_job(job_type: str, input_data: dict) -> dict:
    now = time.time()
    job = {
        "id": f"job_{job_type}_{uuid.uuid4().hex[:12]}",
        "type": job_type,
        "status": "queued",
        "input": input_data,
        "output": None,
        "error": None,
        "provider": input_data.get("provider", "auto"),
        "model": None,
        "createdAt": now,
        "updatedAt": now,
    }
    _JOBS[job["id"]] = job
    _trim()
    return job

def update_job(job_id: str, **patch) -> dict | None:
    job = _JOBS.get(job_id)
    if not job:
        return None
    job.update(patch)
    job["updatedAt"] = time.time()
    return job

def get_job(job_id: str) -> dict | None:
    return _JOBS.get(job_id)

def list_jobs(user_id: str | None = None) -> List[dict]:
    jobs = list(_JOBS.values())
    if user_id:
        jobs = [job for job in jobs if job.get("input", {}).get("userId") == user_id or job.get("input", {}).get("userEmail") == user_id]
    return sorted(jobs, key=lambda job: job["updatedAt"], reverse=True)[:100]
