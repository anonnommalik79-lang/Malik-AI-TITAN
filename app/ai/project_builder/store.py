from __future__ import annotations
import time
import uuid
from typing import Any, Dict, List

_PROJECTS: Dict[str, Dict[str, Any]] = {}

def create_project_job(prompt: str, data: dict) -> dict:
    now = time.time()
    job = {
        "id": f"project_job_{uuid.uuid4().hex[:12]}",
        "type": "project",
        "status": "queued",
        "input": data,
        "output": None,
        "error": None,
        "createdAt": now,
        "updatedAt": now,
    }
    _PROJECTS[job["id"]] = job
    return job

def update_project_job(job_id: str, **patch) -> dict | None:
    job = _PROJECTS.get(job_id)
    if not job:
        return None
    job.update(patch)
    job["updatedAt"] = time.time()
    return job

def get_project(job_id: str) -> dict | None:
    return _PROJECTS.get(job_id)

def list_projects(user_id: str | None = None) -> List[dict]:
    projects = list(_PROJECTS.values())
    if user_id:
        projects = [p for p in projects if p.get("input", {}).get("userId") == user_id or p.get("input", {}).get("userEmail") == user_id]
    return sorted(projects, key=lambda p: p["updatedAt"], reverse=True)[:100]
