from __future__ import annotations

from pathlib import Path
from threading import Thread

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


def _public_job(job: dict | None) -> dict:
    if not job:
        return {}
    raw_status = str(job.get("status") or "queued")
    status = {
        "processing": "generating",
        "completed": "ready",
        "needs_storage": "rendering",
    }.get(raw_status, raw_status)
    output = job.get("output") if isinstance(job.get("output"), dict) else {}
    url = str(
        output.get("imageUrl")
        or output.get("videoUrl")
        or output.get("mediaUrl")
        or output.get("url")
        or ""
    )
    public = {
        "id": job.get("id"),
        "jobId": job.get("id"),
        "type": job.get("type"),
        "status": status,
        "progress": 100 if status in {"ready", "failed"} else int(job.get("progress") or 12),
        "provider": job.get("provider"),
        "model": job.get("model"),
        "error": job.get("error"),
        "output": output,
        "createdAt": job.get("createdAt"),
        "updatedAt": job.get("updatedAt"),
    }
    if url:
        public.update({"url": url, "mediaUrl": url})
        if job.get("type") == "image":
            public["imageUrl"] = url
        else:
            public["videoUrl"] = url
    return public


def _run_image_job(job_id: str, data: dict) -> None:
    update_job(job_id, status="processing", progress=18)
    try:
        output = generate_image(data)
        update_job(
            job_id,
            status="completed",
            progress=100,
            output=output,
            provider=output.get("provider"),
            model=output.get("model"),
        )
    except Exception as exc:
        update_job(job_id, status="failed", progress=100, error=str(exc)[:700])


@media_jobs_bp.post("/api/ai/image")
def create_image_job():
    data, error = _payload()
    if error:
        return jsonify({"ok": False, "error": error[0]}), error[1]

    # The mobile/desktop model selector stores the image model in this cookie.
    # Carry it into the background worker so the server really uses the model
    # shown beside “Фото”, instead of silently selecting an unrelated provider.
    data.setdefault("modelId", request.cookies.get("malik_image_model_v1") or "flux-klein-4b")

    job = create_job("image", data)
    Thread(target=_run_image_job, args=(job["id"], data), daemon=True, name=job["id"]).start()
    public = _public_job(get_job(job["id"]))
    return jsonify({
        "ok": True,
        "status": public.get("status", "queued"),
        "jobId": job["id"],
        "statusUrl": f"/api/ai/job/{job['id']}",
        "job": public,
    }), 202


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
    public = _public_job(job)
    return jsonify({"ok": True, **public, "job": public})


@media_jobs_bp.get("/api/ai/history")
def history():
    user_id = request.args.get("userId")
    return jsonify({"ok": True, "jobs": [_public_job(job) for job in list_jobs(user_id)]})


@media_jobs_bp.get("/api/ai/media/status")
def media_status():
    return jsonify({"ok": True, "image": image_provider_status(), "video": video_provider_status()})


@media_jobs_bp.get("/api/storage/videos/<path:filename>")
def serve_generated_video_file(filename: str):
    return send_from_directory(str(VIDEO_STORAGE_DIR), filename)
