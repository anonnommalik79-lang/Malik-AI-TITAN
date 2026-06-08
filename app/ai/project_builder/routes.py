from __future__ import annotations

from flask import Blueprint, jsonify, request
from .generator import build_project
from .store import create_project_job, get_project, list_projects, update_project_job

project_builder_bp = Blueprint("project_builder", __name__, url_prefix="/api/ai")

@project_builder_bp.post("/project")
def create_project():
    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt") or data.get("question") or "").strip()

    if not prompt:
        return jsonify({"ok": False, "error": "Prompt is required."}), 400

    if len(prompt) > 12000:
        return jsonify({"ok": False, "error": "Prompt is too long. Max 12000 chars."}), 400

    job = create_project_job(prompt, data)
    update_project_job(job["id"], status="processing")

    try:
        project = build_project(prompt, provider=str(data.get("provider") or "local-project-builder"))
        update_project_job(job["id"], status="completed", output=project)
        return jsonify({
            "ok": True,
            "jobId": job["id"],
            "projectId": project["projectId"],
            "status": "completed",
            "project": project,
            "job": get_project(job["id"]),
        })
    except Exception as exc:
        update_project_job(job["id"], status="failed", error=str(exc))
        return jsonify({"ok": False, "jobId": job["id"], "status": "failed", "error": str(exc)}), 500

@project_builder_bp.get("/project/<project_id>")
def read_project(project_id: str):
    job = get_project(project_id)
    if job:
        return jsonify({"ok": True, "job": job, "project": job.get("output")})
    return jsonify({"ok": False, "error": "Project not found."}), 404

@project_builder_bp.get("/projects")
def read_projects():
    user_id = request.args.get("userId")
    return jsonify({"ok": True, "projects": list_projects(user_id)})
