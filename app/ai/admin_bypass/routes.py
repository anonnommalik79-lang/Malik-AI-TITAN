from __future__ import annotations
import os
import time
from flask import Blueprint, jsonify, request

admin_bypass_bp = Blueprint("admin_bypass", __name__, url_prefix="/api/ai")

DEFAULT_ADMIN_EMAILS = ["amangeldymalik38@gmail.com", "anonnommalik79@gmail.com", "admin@malik.ai"]

USAGE = {}
LIMITS = {
    "free": {"chat": 50, "image": 5, "video": 1, "project": 2},
    "pro": {"chat": 500, "image": 50, "video": 10, "project": 20},
    "ultra": {"chat": 5000, "image": 500, "video": 100, "project": 200},
    "owner": {"chat": 999999, "image": 999999, "video": 999999, "project": 999999},
}

def _emails():
    raw = os.environ.get("ADMIN_EMAILS") or os.environ.get("MALIK_ADMIN_USERS") or ",".join(DEFAULT_ADMIN_EMAILS)
    return [item.strip().lower() for item in raw.split(",") if item.strip()]

def _env():
    return (os.environ.get("NEXT_PUBLIC_APP_ENV") or os.environ.get("APP_ENV") or os.environ.get("NODE_ENV") or "production").lower()

def _is_local():
    return _env() in {"development", "local", "test"}

def _dev_bypass():
    return os.environ.get("DEV_BYPASS_LIMITS", "").lower() == "true" and _is_local()

def _email_from_request():
    data = request.get_json(silent=True) or {}
    return (
        request.args.get("userEmail")
        or request.args.get("email")
        or request.args.get("userId")
        or data.get("userEmail")
        or data.get("email")
        or data.get("userId")
        or "guest"
    ).strip().lower()

def _is_admin(email: str):
    return email in _emails()

def _plan(email: str, requested: str = "free"):
    if _is_admin(email) or _dev_bypass():
        return "owner"
    if requested in LIMITS:
        return requested
    return "free"

def _today():
    return time.strftime("%Y-%m-%d")

def _usage(email: str, plan: str):
    key = f"{email}:{_today()}"
    if key not in USAGE:
        USAGE[key] = {"userId": email, "plan": plan, "date": _today(), "chat": 0, "image": 0, "video": 0, "project": 0}
    return USAGE[key]

def _status(email: str):
    admin = _is_admin(email)
    dev = _dev_bypass()
    can = admin or dev
    return {
        "admin": admin,
        "devBypass": dev,
        "canBypass": can,
        "plan": "owner" if can else "free",
        "appEnvironment": _env(),
        "label": "Admin mode active" if admin else "Dev bypass limits enabled" if dev else "Production limits active",
        "message": "All limits unlocked for owner." if admin else "Limits disabled only in development/local mode." if dev else "Usage limits are active.",
    }

@admin_bypass_bp.get("/admin/status")
def admin_status():
    email = _email_from_request()
    return jsonify({"ok": True, "userEmail": email, "bypass": _status(email), "secretsExposed": False})

@admin_bypass_bp.get("/limits/status")
def limits_status():
    email = _email_from_request()
    requested_plan = request.args.get("plan", "free")
    plan = _plan(email, requested_plan)
    usage = _usage(email, plan)
    limits = LIMITS[plan]
    remaining = {key: max(0, limits[key] - usage[key]) for key in limits}
    bypass = _status(email)
    return jsonify({
        "ok": True,
        "userEmail": email,
        "plan": plan,
        "usage": usage,
        "limits": limits,
        "remaining": remaining,
        "bypass": bypass,
        "showPaywall": False if bypass["canBypass"] else None,
        "secretsExposed": False,
    })

@admin_bypass_bp.post("/limits/check")
def limits_check():
    data = request.get_json(silent=True) or {}
    email = _email_from_request()
    kind = str(data.get("kind") or data.get("task") or "chat")
    requested_plan = str(data.get("plan") or "free")
    if kind not in {"chat", "image", "video", "project"}:
        return jsonify({"ok": False, "error": "Invalid limit kind."}), 400

    plan = _plan(email, requested_plan)
    bypass = _status(email)

    if bypass["canBypass"]:
        return jsonify({
            "ok": True,
            "allowed": True,
            "bypass": bypass,
            "plan": "owner",
            "kind": kind,
            "showPaywall": False,
            "message": bypass["message"],
        })

    usage = _usage(email, plan)
    limit = LIMITS[plan][kind]
    used = usage[kind]
    allowed = used < limit

    return jsonify({
        "ok": True,
        "allowed": allowed,
        "bypass": bypass,
        "plan": plan,
        "kind": kind,
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
        "showPaywall": (not allowed and plan == "free"),
        "message": "Usage allowed." if allowed else "Limit reached. Upgrade required.",
    })

@admin_bypass_bp.post("/limits/increment")
def limits_increment():
    data = request.get_json(silent=True) or {}
    email = _email_from_request()
    kind = str(data.get("kind") or data.get("task") or "chat")
    requested_plan = str(data.get("plan") or "free")
    if kind not in {"chat", "image", "video", "project"}:
        return jsonify({"ok": False, "error": "Invalid limit kind."}), 400

    plan = _plan(email, requested_plan)
    bypass = _status(email)
    usage = _usage(email, plan)

    if not bypass["canBypass"]:
      usage[kind] += 1

    limits = LIMITS[plan]
    remaining = {key: max(0, limits[key] - usage[key]) for key in limits}
    return jsonify({"ok": True, "usage": usage, "limits": limits, "remaining": remaining, "bypass": bypass, "showPaywall": False})
