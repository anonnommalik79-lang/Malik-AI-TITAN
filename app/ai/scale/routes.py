from __future__ import annotations
import os
import time
from flask import Blueprint, jsonify, request

scale_bp = Blueprint("scale", __name__, url_prefix="/api/ai")

_USAGE = {}

LIMITS = {
    "free": {"chat": 50, "image": 5, "video": 1, "project": 2},
    "pro": {"chat": 500, "image": 50, "video": 10, "project": 20},
    "ultra": {"chat": 5000, "image": 500, "video": 100, "project": 200},
    "owner": {"chat": 999999, "image": 999999, "video": 999999, "project": 999999},
}

def today():
    return time.strftime("%Y-%m-%d")

def user_key(user_id: str):
    return f"{user_id or 'guest'}:{today()}"

def get_usage(user_id: str, plan: str = "free"):
    key = user_key(user_id)
    if key not in _USAGE:
        _USAGE[key] = {"userId": user_id or "guest", "plan": plan, "date": today(), "chat": 0, "image": 0, "video": 0, "project": 0}
    return _USAGE[key]

def public_status():
    return {
        "database": {"configured": bool(os.environ.get("DATABASE_URL")), "mode": "postgres" if os.environ.get("DATABASE_URL") else "memory-dev"},
        "redis": {"configured": bool(os.environ.get("REDIS_URL")), "mode": "redis-ready" if os.environ.get("REDIS_URL") else "memory-dev"},
        "storage": {
            "configured": bool(os.environ.get("STORAGE_BUCKET") or os.environ.get("S3_BUCKET") or os.environ.get("R2_BUCKET")),
            "mode": "object-storage-ready" if (os.environ.get("STORAGE_BUCKET") or os.environ.get("S3_BUCKET") or os.environ.get("R2_BUCKET")) else "local-dev",
        },
        "providers": {
            "groq": bool(os.environ.get("GROQ_API_KEY")),
            "gemini": bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")),
            "openai": bool(os.environ.get("OPENAI_API_KEY")),
            "anthropic": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "openrouter": bool(os.environ.get("OPENROUTER_API_KEY")),
            "stability": bool(os.environ.get("STABILITY_API_KEY")),
            "runway": bool(os.environ.get("RUNWAY_API_KEY") or os.environ.get("RUNWAYML_API_SECRET")),
        },
        "secretsExposed": False,
    }

@scale_bp.get("/scale/status")
def scale_status():
    return jsonify({"ok": True, **public_status(), "time": int(time.time())})

@scale_bp.get("/usage")
def usage_get():
    user_id = request.args.get("userId") or "guest"
    plan = request.args.get("plan") or "free"
    usage = get_usage(user_id, plan)
    limits = LIMITS.get(plan, LIMITS["free"])
    remaining = {key: max(0, limits[key] - usage[key]) for key in limits}
    return jsonify({"ok": True, "usage": usage, "limits": limits, "remaining": remaining})

@scale_bp.post("/usage/increment")
def usage_increment():
    data = request.get_json(silent=True) or {}
    user_id = str(data.get("userId") or "guest")
    plan = str(data.get("plan") or "free")
    kind = str(data.get("kind") or "chat")
    if kind not in {"chat", "image", "video", "project"}:
        return jsonify({"ok": False, "error": "Invalid usage kind"}), 400
    usage = get_usage(user_id, plan)
    limits = LIMITS.get(plan, LIMITS["free"])
    if usage[kind] >= limits[kind]:
        return jsonify({"ok": False, "error": "Usage limit reached", "usage": usage, "limits": limits}), 429
    usage[kind] += 1
    remaining = {key: max(0, limits[key] - usage[key]) for key in limits}
    return jsonify({"ok": True, "usage": usage, "limits": limits, "remaining": remaining})
