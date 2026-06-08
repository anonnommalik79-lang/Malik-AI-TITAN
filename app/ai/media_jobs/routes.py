from __future__ import annotations

from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory

from .store import create_job, get_job, list_jobs, update_job
from .providers import generate_image, generate_video, image_provider_status, video_provider_status

BASE_DIR = Path(__file__).resolve().parents[3]
VIDEO_STORAGE_DIR = BASE_DIR / "app" / "static" / "storage" / "videos"
VIDEO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# No url_prefix here: every route declares the exact public path. This lets the
# same blueprint expose /api/ai/* and /api/storage/videos/* without touching run.py.
media_jobs_bp = Blueprint("media_jobs", __name__)


def _payload():
    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt", "") or data.get("question", "") or data.get("message", "")).strip()
    if not prompt:
        return None, ("Prompt is required.", 400)
    data["prompt"] = prompt
    return data, None


@media_jobs_bp.post("/api/ai/image")
def create_image_job():
    data, error = _payload()
    if error:
        return jsonify({"ok": False, "error": error[0]}), error[1]

    job = create_job("image", data)
    update_job(job["id"], status="processing")
    try:
        output = generate_image(data)
        update_job(job["id"], status="completed", output=output, provider=output.get("provider"), model=output.get("model"))
    except Exception as exc:
        update_job(job["id"], status="failed", error=str(exc))
    return jsonify({"ok": True, "jobId": job["id"], "job": get_job(job["id"])})


@media_jobs_bp.post("/api/ai/video")
def create_video_job():
    data, error = _payload()
    if error:
        return jsonify({"ok": False, "error": error[0]}), error[1]

    job = create_job("video", data)
    update_job(job["id"], status="processing")
    try:
        output = generate_video(data)
        status = str(output.get("status") or "completed")
        final_status = "needs_storage" if status == "needs_s3_output" else "completed"
        update_job(job["id"], status=final_status, output=output, provider=output.get("provider"), model=output.get("model"))
    except Exception as exc:
        update_job(job["id"], status="failed", error=str(exc))
    return jsonify({"ok": True, "jobId": job["id"], "job": get_job(job["id"])})


@media_jobs_bp.get("/api/ai/job/<job_id>")
def read_job(job_id: str):
    job = get_job(job_id)
    if not job:
        return jsonify({"ok": False, "error": "Job not found"}), 404
    return jsonify({"ok": True, "job": job})


@media_jobs_bp.get("/api/ai/history")
def history():
    user_id = request.args.get("userId")
    return jsonify({"ok": True, "jobs": list_jobs(user_id)})


@media_jobs_bp.get("/api/ai/media/status")
def media_status():
    return jsonify({"ok": True, "image": image_provider_status(), "video": video_provider_status()})


@media_jobs_bp.get("/api/storage/videos/<path:filename>")
def serve_generated_video_file(filename: str):
    return send_from_directory(str(VIDEO_STORAGE_DIR), filename)
