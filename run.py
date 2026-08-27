
# -*- coding: utf-8 -*-
"""
MALIK AI RENDER RECOVERY RUN.PY
Р¦РµР»СЊ: РІРµСЂРЅСѓС‚СЊ СЃР°Р№С‚, РЅРµ Р»РѕРјР°СЏ AI.
- "/" Рё Р»СЋР±С‹Рµ frontend routes РѕС‚РґР°СЋС‚ Next static out/index.html
- /api/stream СЂР°Р±РѕС‚Р°РµС‚ СЃ С‚РІРѕРёРј Р±РѕР»СЊС€РёРј ai_model.py
- /api/codex СЂР°Р±РѕС‚Р°РµС‚ РµСЃР»Рё РІ ai_model.py РµСЃС‚СЊ build_codex_project
- /api/features РїРѕРґРєР»СЋС‡Р°РµС‚СЃСЏ Р±РµР·РѕРїР°СЃРЅРѕ, РµСЃР»Рё РїР°РїРєР° backend/features СЃСѓС‰РµСЃС‚РІСѓРµС‚
- /admin_db С‡РµСЂРµР· С‡Р°С‚ С‡РёС‚Р°РµС‚ Supabase users, РµСЃР»Рё СЃС‚РѕСЏС‚ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import json
import html
import os
import sqlite3
import sys
import time
import traceback
import uuid
import mimetypes
from contextlib import closing
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

os.environ["START_TIME"] = os.environ.get("START_TIME", str(time.time()))

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "database"))

try:
    from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context
    from flask_cors import CORS
    from werkzeug.security import check_password_hash, generate_password_hash
except Exception as import_error:
    raise RuntimeError(
        "Base dependencies missing. Put them into requirements.txt: Flask flask-cors Werkzeug"
    ) from import_error

try:
    import requests
except Exception as requests_error:
    requests = None
    print("WARNING [MALIK] requests import failed; Supabase admin API will be disabled:", requests_error)

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except Exception as psycopg_error:
    psycopg2 = None
    RealDictCursor = None
    print("WARNING [MALIK DB] psycopg2 import failed; PostgreSQL features disabled:", psycopg_error)

# ---------------- Flask ----------------
app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MALIK_MAX_CONTENT_LENGTH", str(32 * 1024 * 1024)))
CORS(app, resources={r"/api/*": {"origins": "*"}, r"/*": {"origins": "*"}})

def log_event(level: str, message: str, **extra: Any) -> None:
    payload = {"level": level, "message": message, "time": int(time.time()), **extra}
    try:
        print("[MALIK]", json.dumps(payload, ensure_ascii=False))
    except Exception:
        print(f"[MALIK] {level}: {message} {extra}")

def safe_json_response(payload: Dict[str, Any], status: int = 200):
    return jsonify(payload), status

@app.errorhandler(413)
def payload_too_large(_error):
    return safe_json_response({
        "ok": False,
        "error": "payload_too_large",
        "message": "Upload/request is too large for this server.",
        "maxBytes": app.config.get("MAX_CONTENT_LENGTH"),
    }, 413)

@app.errorhandler(500)
def internal_error(error):
    log_event("error", "Unhandled Flask error", error=str(error), path=request.path)
    if request.path.startswith("/api/"):
        return safe_json_response({"ok": False, "error": "internal_server_error", "message": str(error)}, 500)
    return diagnostic_html(request.path, extra_error=str(error)), 500

@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return safe_json_response({"ok": False, "error": "api_route_not_found", "path": request.path}, 404)
    return diagnostic_html(request.path, extra_error="frontend_route_not_found"), 404

# ---------------- AI import ----------------
try:
    from ai_model import ask_malik_ai, ask_malik_ai_stream, USER_MEMORY
    try:
        from ai_model import build_codex_project
    except Exception:
        build_codex_project = None
    print("рџ§  [MALIK] ai_model.py loaded")
except Exception as err:
    print("вќЊ [MALIK] ai_model.py import failed:", err)
    traceback.print_exc()
    USER_MEMORY = {}
    build_codex_project = None

    def ask_malik_ai_stream(*args, **kwargs):
        yield {"error": "ai_model.py failed to import"}

    def ask_malik_ai(*args, **kwargs):
        return {"status": "text", "content": "вљ пёЏ ai_model.py РЅРµ Р·Р°РіСЂСѓР·РёР»СЃСЏ. РЎРјРѕС‚СЂРё Render logs."}

# ---------------- Optional 200 Features routes ----------------
try:
    from backend.features.routes import register_feature_routes
    register_feature_routes(app)
    print("вњ… [MALIK] 200 Features routes connected")
except Exception as e:
    print("вљ пёЏ [MALIK] 200 Features routes skipped:", e)


# ---------------- Optional Stage 3 media jobs routes ----------------
try:
    from app.ai.media_jobs import media_jobs_bp
    app.register_blueprint(media_jobs_bp)
    print("вњ… [MALIK] Stage 3 media job routes connected: /api/ai/image /api/ai/video /api/ai/job/<id> /api/ai/history")
except Exception as e:
    print("вљ пёЏ [MALIK] Stage 3 media job routes skipped:", e)


# ---------------- Optional Stage 4 project builder routes ----------------
try:
    from app.ai.project_builder import project_builder_bp
    app.register_blueprint(project_builder_bp)
    print("вњ… [MALIK] Stage 4 project builder routes connected: /api/ai/project /api/ai/project/<id> /api/ai/projects")
except Exception as e:
    print("вљ пёЏ [MALIK] Stage 4 project builder routes skipped:", e)

# ---------------- Optional Stage 5 scale routes ----------------
try:
    from app.ai.scale import scale_bp
    app.register_blueprint(scale_bp)
    print("вњ… [MALIK] Stage 5 scale routes connected: /api/ai/scale/status /api/ai/usage")
except Exception as e:
    print("вљ пёЏ [MALIK] Stage 5 scale routes skipped:", e)

# ---------------- Optional Stage 4 admin/dev bypass routes ----------------
try:
    from app.ai.admin_bypass import admin_bypass_bp
    app.register_blueprint(admin_bypass_bp)
    print("вњ… [MALIK] Admin/dev bypass routes connected: /api/ai/admin/status /api/ai/limits/status")
except Exception as e:
    print("вљ пёЏ [MALIK] Admin/dev bypass routes skipped:", e)

# ---------------- Production Voice runtime (Flask / Render) ----------------
# The deployed frontend is static and Flask owns /api/* in production.
# Keep these endpoints in Flask so microphone/STT/TTS do not fall through to
# browser speechSynthesis when Next server routes are unavailable.
try:
    import importlib.util as _voice_importlib_util
    from pathlib import Path as _VoicePath
    _voice_runtime_path = _VoicePath(__file__).resolve().parent / "app" / "ai" / "voice_runtime.py"
    _voice_runtime_spec = _voice_importlib_util.spec_from_file_location("malik_voice_runtime", _voice_runtime_path)
    if _voice_runtime_spec is None or _voice_runtime_spec.loader is None:
        raise RuntimeError("Voice runtime module loader unavailable")
    _voice_runtime_module = _voice_importlib_util.module_from_spec(_voice_runtime_spec)
    _voice_runtime_spec.loader.exec_module(_voice_runtime_module)
    app.register_blueprint(_voice_runtime_module.voice_runtime_bp)
    print("✅ [MALIK] Voice runtime connected: /api/voice/tts /api/voice/turn /api/transcribe /api/voice/deepgram-token")
except Exception as e:
    print("⚠️ [MALIK] Voice runtime skipped:", e)
DATABASE_URL = os.environ.get("DATABASE_URL", "")
PHOTO_STORAGE_DIR = BASE_DIR / "app" / "static" / "storage" / "photos"
PROJECT_STORAGE_DIR = BASE_DIR / "app" / "static" / "storage" / "projects"

def ensure_directory(path: Path, label: str) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        return True
    except Exception as exc:
        log_event("error", f"Failed to create {label} directory", path=str(path), error=str(exc))
        return False

ensure_directory(PHOTO_STORAGE_DIR, "photo storage")
ensure_directory(PROJECT_STORAGE_DIR, "project storage")
ADMIN_USERS = [
    x.strip().lower()
    for x in os.environ.get(
        "MALIK_ADMIN_USERS",
        "amangeldymalik38@gmail.com,anonnommalik79@gmail.com,admin,malik,abdumalik",
    ).split(",")
    if x.strip()
]

USER_LIMITS: Dict[str, list[float]] = {}

def is_owner_user(user: str) -> bool:
    u = str(user or "").strip().lower()
    return u in ADMIN_USERS

def check_rate_limit(user: str) -> bool:
    user = str(user or "guest").lower()
    if is_owner_user(user):
        return True
    now = time.time()
    arr = USER_LIMITS.setdefault(user, [])
    arr[:] = [t for t in arr if now - t < 60]
    if len(arr) >= 40:
        return False
    arr.append(now)
    return True

def get_db_connection():
    if not DATABASE_URL:
        return None
    if psycopg2 is None:
        raise RuntimeError("psycopg2 is not installed; PostgreSQL disabled")
    return psycopg2.connect(DATABASE_URL, sslmode=os.environ.get("DATABASE_SSLMODE", "require"))

def init_db():
    if not DATABASE_URL:
        print("WARNING [MALIK DB] DATABASE_URL missing; running without app DB.")
        return
    if psycopg2 is None:
        print("WARNING [MALIK DB] psycopg2 missing; skipping DB init.")
        return
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        username TEXT PRIMARY KEY,
                        password TEXT,
                        is_pro BOOLEAN DEFAULT FALSE,
                        free_pres_used INT DEFAULT 0,
                        free_osint_used INT DEFAULT 0
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS history (
                        id SERIAL PRIMARY KEY,
                        username TEXT,
                        role TEXT,
                        content TEXT,
                        is_html BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                    """
                )
                conn.commit()
        print("рџ’ѕ [MALIK DB] PostgreSQL synced.")
    except Exception as e:
        print("вќЊ [MALIK DB] init failed:", e)

init_db()

def sse_payload(obj: Dict[str, Any]) -> str:
    return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"

def normalize_ai_chunk(chunk: Any) -> Dict[str, Any] | None:
    if chunk is None:
        return None

    if isinstance(chunk, dict):
        if "error" in chunk:
            return {"error": str(chunk["error"])}
        text = chunk.get("content") or chunk.get("text") or chunk.get("message") or chunk.get("response") or chunk.get("delta") or ""
        return {"content": str(text)}

    chunk_str = str(chunk)
    if not chunk_str.strip():
        return None

    if chunk_str.startswith("data:"):
        chunk_str = chunk_str[5:].lstrip()
    if chunk_str.endswith("\n\n"):
        chunk_str = chunk_str[:-2]
    if chunk_str.strip() == "[DONE]":
        return None

    try:
        parsed = json.loads(chunk_str)
        if "error" in parsed:
            return {"error": str(parsed["error"])}
        text = parsed.get("content") or parsed.get("text") or parsed.get("message") or parsed.get("response") or parsed.get("delta") or ""
        return {"content": str(text)}
    except Exception:
        return {"content": chunk_str}

def get_supabase_auth_users():
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if requests is None:
        return {"ok": False, "error": "requests package missing", "users": []}
    if not supabase_url or not service_key:
        return {"ok": False, "error": "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", "users": []}

    try:
        resp = requests.get(
            f"{supabase_url}/auth/v1/admin/users",
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
            timeout=20,
        )
        if resp.status_code >= 400:
            return {"ok": False, "error": resp.text[:800], "users": []}
        data = resp.json()
        return {"ok": True, "error": None, "users": data.get("users", data if isinstance(data, list) else [])}
    except Exception as e:
        return {"ok": False, "error": str(e), "users": []}

def build_supabase_users_report(users):
    lines = ["MALIK AI SUPABASE AUTH USERS", "", f"Total users: {len(users)}", ""]
    for i, u in enumerate(users[:300], 1):
        app_meta = u.get("app_metadata") or {}
        meta = u.get("user_metadata") or {}
        providers = app_meta.get("providers") or []
        lines.append(f"{i}. {u.get('email') or 'вЂ”'}")
        lines.append(f"   UID: {u.get('id') or 'вЂ”'}")
        lines.append(f"   Created: {u.get('created_at') or 'вЂ”'}")
        lines.append(f"   Last sign in: {u.get('last_sign_in_at') or 'вЂ”'}")
        lines.append(f"   Providers: {', '.join(providers) if providers else app_meta.get('provider','email')}")
        if meta.get("full_name") or meta.get("name"):
            lines.append(f"   Name: {meta.get('full_name') or meta.get('name')}")
        if meta.get("avatar_url") or meta.get("picture"):
            lines.append(f"   Avatar: {meta.get('avatar_url') or meta.get('picture')}")
        lines.append("")
    return "```txt\n" + "\n".join(lines) + "\n```"

def _safe_text(value: Any, fallback: str = "") -> str:
    return str(value or fallback).strip()

def _generator_payload(kind: str, prompt: str) -> Dict[str, Any]:
    safe_prompt = _safe_text(prompt, f"Malik AI {kind} generation")
    title = safe_prompt[:72] or f"Malik AI {kind}"
    code = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#030303] text-white">
  <main class="min-h-screen overflow-hidden">
    <section class="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <div class="inline-flex w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-200">
        Malik AI {html.escape(kind.title())} Generator
      </div>
      <h1 class="mt-8 text-5xl font-black tracking-tight md:text-7xl">{html.escape(title)}</h1>
      <p class="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
        Safe local fallback artifact generated by Malik AI. Connect provider keys to replace this with live AI output.
      </p>
      <div class="mt-10 grid gap-4 md:grid-cols-3">
        {''.join([f'<div class="rounded-3xl border border-white/10 bg-white/[0.05] p-6"><p class="text-sm font-bold text-violet-300">Module {i}</p><h3 class="mt-3 text-2xl font-black">Connected Layer</h3><p class="mt-3 text-zinc-400">UI, backend hook, fallback and Render-ready contract.</p></div>' for i in range(1, 4)])}
      </div>
    </section>
  </main>
</body>
</html>"""
    return {
        "ok": True,
        "kind": kind,
        "prompt": safe_prompt,
        "status": "generated-local-fallback",
        "fallback": True,
        "message": f"{kind.title()} generator safe fallback completed.",
        "files": [
            {"path": f"generated/{kind}-preview.html", "language": "html", "content": code},
            {"path": f"generated/{kind}-brief.md", "language": "markdown", "content": f"# {title}\n\nPrompt: {safe_prompt}\n"},
        ],
        "code": code,
    }

def _create_photo_fallback(prompt: str, style: str, size: str, quality: str) -> Dict[str, Any]:
    safe_prompt = _safe_text(prompt, "Malik AI premium photo")
    safe_style = _safe_text(style, "cinematic")
    safe_size = _safe_text(size, "1024x1024")
    safe_quality = _safe_text(quality, "high")
    filename = f"malik_photo_{int(time.time())}_{uuid.uuid4().hex[:8]}.svg"
    ensure_directory(PHOTO_STORAGE_DIR, "photo storage")
    target = PHOTO_STORAGE_DIR / filename
    escaped_prompt = html.escape(safe_prompt[:240])
    escaped_style = html.escape(safe_style)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="g1" cx="25%" cy="15%" r="80%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="45%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <linearGradient id="g2" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.85"/>
      <stop offset="50%" stop-color="#a855f7" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.2"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="18" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#g1)"/>
  <circle cx="760" cy="220" r="210" fill="#22d3ee" opacity="0.16" filter="url(#glow)"/>
  <circle cx="280" cy="780" r="260" fill="#a855f7" opacity="0.18" filter="url(#glow)"/>
  <rect x="104" y="122" width="816" height="780" rx="64" fill="#030712" opacity="0.72" stroke="url(#g2)" stroke-width="3"/>
  <path d="M180 690 C320 470, 420 580, 540 410 C660 240, 790 330, 850 210" fill="none" stroke="#22d3ee" stroke-width="12" opacity="0.75" filter="url(#glow)"/>
  <text x="150" y="236" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="900">Malik AI Photo</text>
  <text x="150" y="292" fill="#a5b4fc" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700">{escaped_style} / {html.escape(safe_quality)} / {html.escape(safe_size)}</text>
  <foreignObject x="150" y="620" width="724" height="190">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Arial,sans-serif;color:white;font-size:34px;font-weight:900;line-height:1.15;">
      {escaped_prompt}
    </div>
  </foreignObject>
  <text x="150" y="842" fill="#67e8f9" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="800">Safe local fallback saved to static/storage/photos</text>
</svg>"""
    target.write_text(svg, encoding="utf-8")
    return {
        "ok": True,
        "kind": "photo",
        "prompt": safe_prompt,
        "style": safe_style,
        "size": safe_size,
        "quality": safe_quality,
        "fallback": True,
        "filename": filename,
        "path": str(target.relative_to(BASE_DIR)),
        "url": f"/api/storage/photos/{filename}",
        "gallery": [f"/api/storage/photos/{item.name}" for item in sorted(PHOTO_STORAGE_DIR.glob("*"))[-12:]],
        "message": "Photo generated in safe local fallback mode.",
    }

def _codex_public_providers() -> list[Dict[str, Any]]:
    providers = [
        ("openai", "OpenAI", "OPENAI_API_KEY", os.environ.get("MALIK_CODEX_MODEL", "gpt-5.5")),
        ("anthropic", "Anthropic", "ANTHROPIC_API_KEY", "claude-sonnet"),
        ("google", "Google Gemini", "GOOGLE_API_KEY", "gemini-pro"),
        ("groq", "Groq", "GROQ_API_KEY", "llama-3.3-70b"),
        ("openrouter", "OpenRouter", "OPENROUTER_API_KEY", "openrouter/auto"),
    ]
    active = os.environ.get("MALIK_CODEX_PROVIDER", "openai")
    return [
        {
            "id": pid,
            "label": label,
            "model": model,
            "enabled": bool(os.environ.get(env)),
            "active": pid == active,
            "apiKeyConfigured": bool(os.environ.get(env)),
            "fallbackEnabled": os.environ.get("MALIK_CODEX_PROVIDER_FALLBACK", "0") == "1",
            "autoModeEnabled": os.environ.get("MALIK_CODEX_AUTO_MODE", "0") == "1",
        }
        for pid, label, env, model in providers
    ]

def _codex_plan(mode: str, prompt: str, files: list[str] | None = None) -> Dict[str, Any]:
    presets = {
        "audit": "Audit Project",
        "fix-bugs": "Fix Bugs",
        "generate-feature": "Generate Feature",
        "refactor": "Refactor Files",
        "create-ui": "Create UI",
        "connect-backend": "Connect Backend",
        "render-deploy": "Render Deploy Fix",
        "full-boss": "Full Boss Mode",
    }
    return {
        "ok": True,
        "mode": mode,
        "title": presets.get(mode, "Audit Project"),
        "prompt": prompt,
        "files": files or [],
        "steps": [
            "Audit protected files",
            "Map UI action to backend hook",
            "Prepare safe patch preview",
            "Run checks",
            "Wait for explicit apply/deploy confirmation",
        ],
        "issues": ["Provider fallback disabled by default", "API keys are never exposed to frontend"],
    }

# ---------------- API ----------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "service": "Malik AI Ultra",
        "ai_loaded": ask_malik_ai is not None,
        "features_routes_hint": "/api/features",
        "stage3_media_jobs_hint": "/api/ai/media/status",
        "stage3_image_hint": "/api/ai/image",
        "stage3_video_hint": "/api/ai/video",
        "time": int(time.time()),
    })

@app.route("/api/ping", methods=["GET"])
def ping():
    return jsonify({"status": "alive", "engine": "Malik AI Sovereign"}), 200

@app.route("/api/runtime/env-check", methods=["GET", "OPTIONS"])
def runtime_env_check():
    if request.method == "OPTIONS":
        return "", 204
    try:
        from app.api.generators import runtime_env_check as build_media_env_check

        payload = build_media_env_check()
        payload["codex"] = _codex_public_providers()
        payload["storage"] = {
            "databaseUrlConfigured": bool(DATABASE_URL),
            "supabaseUrlConfigured": bool(os.environ.get("SUPABASE_URL", "").strip()),
            "supabaseServiceRoleConfigured": bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()),
        }
        return jsonify(payload), 200
    except Exception as exc:
        traceback.print_exc()
        return jsonify({
            "ok": False,
            "error": "env_check_failed",
            "message": str(exc),
            "secretsExposed": False,
        }), 500


@app.route("/api/ai/status", methods=["GET", "OPTIONS"])
def ai_platform_status():
    if request.method == "OPTIONS":
        return "", 204
    payload = {
        "ok": True,
        "platform": "MALIK AI Sovereign Hub",
        "stage": "stage3-image-video-jobs",
        "routes": {
            "chat": "/api/stream",
            "legacyPhoto": "/api/generate/photo",
            "legacyVideo": "/api/generate/video",
            "stage3Image": "/api/ai/image",
            "stage3Video": "/api/ai/video",
            "stage3Job": "/api/ai/job/<id>",
            "stage3History": "/api/ai/history",
            "stage3MediaStatus": "/api/ai/media/status",
        },
        "providers": {
            "groq": bool(os.environ.get("GROQ_API_KEY", "").strip()),
            "gemini": bool(os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("GOOGLE_API_KEY", "").strip()),
            "openai": bool(os.environ.get("OPENAI_API_KEY", "").strip()),
            "openrouter": bool(os.environ.get("OPENROUTER_API_KEY", "").strip()),
            "anthropic": bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()),
            "stability": bool(os.environ.get("STABILITY_API_KEY", "").strip()),
            "replicate": bool(os.environ.get("REPLICATE_API_TOKEN", "").strip()),
            "runway": bool(os.environ.get("RUNWAY_API_KEY", "").strip() or os.environ.get("RUNWAYML_API_SECRET", "").strip()),
            "veo": bool(os.environ.get("VEO_API_KEY", "").strip() or os.environ.get("GOOGLE_VEO_API_KEY", "").strip()),
            "awsBedrock": bool(os.environ.get("AWS_REGION", "").strip() and os.environ.get("AWS_ACCESS_KEY_ID", "").strip() and os.environ.get("AWS_SECRET_ACCESS_KEY", "").strip()),
        },
        "secretsExposed": False,
        "time": int(time.time()),
    }
    return jsonify(payload), 200

@app.route("/api/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    user = str(data.get("username", "")).strip().lower()
    pw = str(data.get("password", "")).strip()
    if not user:
        return jsonify({"success": False, "error": "Username required"}), 400
    if not DATABASE_URL:
        return jsonify({"success": True})
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO users (username, password) VALUES (%s, %s)", (user, generate_password_hash(pw)))
                conn.commit()
        return jsonify({"success": True})
    except Exception:
        return jsonify({"success": False, "error": "РРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ СѓР¶Рµ Р·Р°РЅСЏС‚."}), 409

@app.route("/api/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    user = str(data.get("username", "")).strip().lower()
    pw = str(data.get("password", "")).strip()
    if is_owner_user(user):
        return jsonify({"success": True, "is_pro": True})
    if not DATABASE_URL:
        return jsonify({"success": True, "is_pro": False})
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM users WHERE username = %s", (user,))
                row = cur.fetchone()
                if row and (pw == "oauth_dummy_pass" or check_password_hash(row["password"], pw)):
                    return jsonify({"success": True, "is_pro": bool(row.get("is_pro"))})
    except Exception:
        pass
    return jsonify({"success": False, "error": "Р”РѕСЃС‚СѓРї РѕС‚РєР»РѕРЅРµРЅ."}), 401

@app.route("/api/buy", methods=["POST", "OPTIONS"])
def buy_pro():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip().lower()
    if not username:
        return jsonify({"success": False, "message": "Username required"}), 400
    if not DATABASE_URL:
        return jsonify({"success": True, "message": "Р—Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р° (СЂРµР¶РёРј Р±РµР· Р±Р°Р·С‹)"})
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE users SET is_pro = TRUE WHERE username = %s", (username,))
                conn.commit()
        return jsonify({"success": True, "message": "РџРѕРґРїРёСЃРєР° Р°РєС‚РёРІРёСЂРѕРІР°РЅР°"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/codex", methods=["POST", "OPTIONS"])
def codex():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt") or data.get("question") or ""
    username = data.get("username") or data.get("userEmail") or "guest"
    try:
        if build_codex_project:
            return jsonify(build_codex_project(prompt, username))
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({
        "ok": True,
        "files": [
            {"path": "README.md", "content": "# Malik Codex\n\n" + str(prompt), "language": "markdown"},
        ],
    })

@app.route("/api/codex/health", methods=["GET", "OPTIONS"])
def codex_health():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({
        "ok": True,
        "module": "Malik Codex 1.0",
        "mode": "safe-local",
        "provider": os.environ.get("MALIK_CODEX_PROVIDER", "openai"),
        "policy": {
            "maxRequestsPerSession": int(os.environ.get("MALIK_CODEX_SESSION_LIMIT", "20")),
            "maxRequestsPerTask": int(os.environ.get("MALIK_CODEX_TASK_LIMIT", "6")),
            "providerFallbackEnabled": os.environ.get("MALIK_CODEX_PROVIDER_FALLBACK", "0") == "1",
            "autoModeEnabled": os.environ.get("MALIK_CODEX_AUTO_MODE", "0") == "1",
        },
    })

@app.route("/api/codex/providers", methods=["GET", "OPTIONS"])
def codex_providers():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({"ok": True, "providers": _codex_public_providers()})

@app.route("/api/codex/plan", methods=["POST", "OPTIONS"])
def codex_plan():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    return jsonify(_codex_plan(str(data.get("mode") or "audit"), str(data.get("prompt") or ""), data.get("files") or []))

@app.route("/api/codex/run", methods=["POST", "OPTIONS"])
def codex_run():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    mode = str(data.get("mode") or "audit")
    if mode == "full-boss" and not data.get("confirmed"):
        return jsonify({
            "ok": False,
            "requiresConfirmation": True,
            "warning": "Full Boss Mode can use many tokens. Confirm before running.",
        }), 202
    provider = str(data.get("provider") or os.environ.get("MALIK_CODEX_PROVIDER", "openai"))
    prompt = str(data.get("prompt") or "")
    return jsonify({
        "ok": True,
        "mode": "api-ready" if any(p["id"] == provider and p["enabled"] for p in _codex_public_providers()) else "safe-local",
        "provider": provider,
        "plan": _codex_plan(mode, prompt, data.get("files") or []),
        "changedFilesPreview": [],
        "cost": {
            "estimatedTokens": max(1, int(len(prompt) / 4) + 2000),
            "estimatedUsd": round((max(1, int(len(prompt) / 4) + 2000)) * 0.000002, 4),
            "note": "Placeholder estimate. Real provider usage should be logged later.",
        },
        "message": "Malik Codex safe local fallback returned a plan. No API request was sent without configured keys.",
    })

@app.route("/api/codex/apply", methods=["POST", "OPTIONS"])
def codex_apply():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({
        "ok": True,
        "applied": False,
        "message": "Apply hook prepared. Reviewed patch application requires backend implementation and explicit confirmation.",
    })

@app.route("/api/codex/usage", methods=["GET", "POST", "OPTIONS"])
def codex_usage():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({
        "ok": True,
        "sessionLimit": int(os.environ.get("MALIK_CODEX_SESSION_LIMIT", "20")),
        "taskLimit": int(os.environ.get("MALIK_CODEX_TASK_LIMIT", "6")),
        "usageLog": [],
        "note": "Usage log placeholder. Store per-user usage in database when billing is connected.",
    })

@app.route("/api/storage/photos/<path:filename>", methods=["GET"])
def serve_generated_photo(filename: str):
    target = PHOTO_STORAGE_DIR / filename
    if not target.exists() or not target.is_file():
        return jsonify({"ok": False, "error": "photo_not_found", "filename": filename}), 404
    return send_from_directory(str(PHOTO_STORAGE_DIR), filename)

@app.route("/api/generate/photo", methods=["POST", "OPTIONS"])
def generate_photo():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    try:
        from app.api.generators import generate_media_response

        payload, status = generate_media_response(
            "photo",
            data,
            storage_dir=PHOTO_STORAGE_DIR,
            public_storage_prefix="/api/storage/photos",
            client_id=request.remote_addr or "guest",
        )
        return jsonify(payload), status
    except Exception:
        traceback.print_exc()
    result = _create_photo_fallback(
        data.get("prompt") or data.get("question") or "",
        data.get("style") or "cinematic",
        data.get("size") or "1024x1024",
        data.get("quality") or "high",
    )
    return jsonify(result)

def _generate_kind(kind: str):
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    return jsonify(_generator_payload(kind, data.get("prompt") or data.get("question") or ""))

@app.route("/api/generate/video", methods=["POST", "OPTIONS"])
def generate_video():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    try:
        from app.api.generators import generate_media_response

        payload, status = generate_media_response(
            "video",
            data,
            storage_dir=PHOTO_STORAGE_DIR,
            public_storage_prefix="/api/storage/photos",
            client_id=request.remote_addr or "guest",
        )
        return jsonify(payload), status
    except Exception:
        traceback.print_exc()
    return jsonify(_generator_payload("video", data.get("prompt") or data.get("question") or ""))

@app.route("/api/generate/code", methods=["POST", "OPTIONS"])
def generate_code():
    return _generate_kind("code")

@app.route("/api/generate/website", methods=["POST", "OPTIONS"])
def generate_website():
    return _generate_kind("website")

@app.route("/api/generate/landing", methods=["POST", "OPTIONS"])
def generate_landing():
    return _generate_kind("landing")

@app.route("/api/generate/dashboard", methods=["POST", "OPTIONS"])
def generate_dashboard():
    return _generate_kind("dashboard")

@app.route("/api/generate/document", methods=["POST", "OPTIONS"])
def generate_document():
    return _generate_kind("document")

@app.route("/api/generate/presentation", methods=["POST", "OPTIONS"])
def generate_presentation():
    return _generate_kind("presentation")

@app.route("/api/generate/template", methods=["POST", "OPTIONS"])
def generate_template():
    return _generate_kind("template")

@app.route("/api/projects/save", methods=["POST", "OPTIONS"])
def save_project():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    project_id = data.get("id") or f"project_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    ensure_directory(PROJECT_STORAGE_DIR, "project storage")
    target = PROJECT_STORAGE_DIR / f"{project_id}.json"
    payload = {
        "ok": True,
        "id": project_id,
        "title": data.get("title") or "Untitled Malik Project",
        "kind": data.get("kind") or "project",
        "createdAt": int(time.time()),
        "data": data,
    }
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return jsonify({**payload, "path": str(target.relative_to(BASE_DIR))})

@app.route("/api/templates", methods=["GET", "OPTIONS"])
def templates():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({
        "ok": True,
        "templates": [
            {"id": "photo-cinematic", "title": "Cinematic Photo", "category": "Photo Generation", "prompt": "Generate a cinematic premium product photo"},
            {"id": "saas-landing", "title": "SaaS Landing", "category": "Website Builder", "prompt": "Generate a premium SaaS landing page with pricing and CTA"},
            {"id": "analytics-dashboard", "title": "Analytics Dashboard", "category": "Dashboard Generator", "prompt": "Generate a dark analytics dashboard with charts and tables"},
            {"id": "react-component", "title": "React Component", "category": "Code Generation", "prompt": "Generate a polished React component with states"},
        ],
    })

@app.route("/api/stream", methods=["POST", "OPTIONS"])
def stream_chat():
    if request.method == "OPTIONS":
        return "", 204

    try:
        data = request.get_json(silent=True) or {}
        prompt = str(data.get("originalQuestion") or data.get("question") or data.get("message") or "").strip()
        user = str(data.get("userEmail") or data.get("email") or data.get("currentUser") or data.get("username") or "Р“РѕСЃС‚СЊ").lower().strip()
        mode = str(data.get("mode") or data.get("responseMode") or "chat").lower().strip()
        history = data.get("history") if isinstance(data.get("history"), list) else []
        attachments = data.get("attachments") if isinstance(data.get("attachments"), list) else []
        first_attachment = attachments[0] if attachments else {}
        media_b64 = data.get("media_b64") or data.get("image_b64") or first_attachment.get("base64") or first_attachment.get("dataUrl")
        media_type = data.get("media_type") or first_attachment.get("mime") or first_attachment.get("type") or "image/jpeg"
        is_creator = bool(data.get("isCreator")) or is_owner_user(user)

        if not prompt and not media_b64:
            return jsonify({"error": "Empty prompt"}), 400

        command = str(prompt or "").strip().lower()
        if command in ("/admin_db", "/admin", "/users", "/supabase_users"):
            def admin_stream():
                if not is_owner_user(user):
                    yield sse_payload({"content": "в›” Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰С‘РЅ. РљРѕРјР°РЅРґР° РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РІР»Р°РґРµР»СЊС†Сѓ Malik AI."})
                    yield "data: [DONE]\n\n"
                    return
                result = get_supabase_auth_users()
                if result.get("ok"):
                    text = build_supabase_users_report(result.get("users") or [])
                else:
                    text = "```txt\nMALIK AI ADMIN DB\n\nSupabase admin API РЅРµРґРѕСЃС‚СѓРїРµРЅ: " + str(result.get("error")) + "\n```"
                yield sse_payload({"content": text})
                yield "data: [DONE]\n\n"
            return Response(stream_with_context(admin_stream()), mimetype="text/event-stream")

        if not check_rate_limit(user):
            def limited():
                yield sse_payload({"error": "РЎРёСЃС‚РµРјР° Р·Р°С‰РёС‚С‹: РїСЂРµРІС‹С€РµРЅ Р»РёРјРёС‚ Р·Р°РїСЂРѕСЃРѕРІ."})
                yield "data: [DONE]\n\n"
            return Response(stream_with_context(limited()), mimetype="text/event-stream")

        def generate():
            try:
                stream_iter = ask_malik_ai_stream(
                    prompt=prompt,
                    username=user,
                    user_email=user,
                    email=user,
                    is_creator=is_creator,
                    is_advanced=(mode in ["pro", "god", "canvas", "code", "codex"]),
                    media_b64=media_b64,
                    media_type=media_type,
                    history=history,
                    mode=mode,
                    attachments=attachments,
                    client=data.get("client") or {},
                    quality=data.get("quality") or {},
                    capabilities=data.get("capabilities") or {},
                )
                for chunk in stream_iter:
                    norm = normalize_ai_chunk(chunk)
                    if not norm:
                        continue
                    yield sse_payload(norm)
            except Exception as e:
                traceback.print_exc()
                yield sse_payload({"error": str(e)})
            yield "data: [DONE]\n\n"

        response = Response(stream_with_context(generate()), mimetype="text/event-stream")
        response.headers["Cache-Control"] = "no-cache, no-transform"
        response.headers["X-Accel-Buffering"] = "no"
        response.headers["Connection"] = "keep-alive"
        return response
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500

@app.route("/api/stats", methods=["GET"])
def get_stats():
    uptime_seconds = time.time() - float(os.environ.get("START_TIME", time.time()))
    uptime = f"{int(uptime_seconds // 3600)}h {int((uptime_seconds % 3600) // 60)}m"

    total_users, pro_users = 0, 0
    if DATABASE_URL:
        try:
            with closing(get_db_connection()) as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_pro = TRUE) as pro FROM users")
                    row = cur.fetchone()
                    total_users, pro_users = row["total"] or 0, row["pro"] or 0
        except Exception:
            pass

    return jsonify({
        "total_users": total_users,
        "active_chats": len(USER_MEMORY) if isinstance(USER_MEMORY, dict) else 0,
        "total_requests": sum(len(v) for v in USER_LIMITS.values()),
        "pro_users": pro_users,
        "uptime": uptime,
        "system_info": {
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        },
    })

# ---------------- Static Next.js serve ----------------
# Render/Vercel/Heroku reliable static Next.js export serving.
# Frontend is expected at app/templates/sovereign-hub-ui/out after `npm run build`.
NEXT_OUT_DIR = BASE_DIR / "app" / "templates" / "sovereign-hub-ui" / "out"

def next_out_candidates() -> list[Path]:
    """Return all static export locations we can safely check without hardcoding CWD."""
    explicit = os.environ.get("MALIK_NEXT_OUT_DIR", "").strip()
    candidates = []
    if explicit:
        candidates.append(Path(explicit).expanduser().resolve())
    candidates.extend([
        NEXT_OUT_DIR,
        BASE_DIR / "out",
        BASE_DIR / "frontend" / "out",
        BASE_DIR / "app" / "templates" / "sovereign-hub-ui" / ".next" / "server" / "app",
    ])
    unique: list[Path] = []
    seen = set()
    for path in candidates:
        key = str(path)
        if key not in seen:
            seen.add(key)
            unique.append(path)
    return unique

def resolve_next_out_dir() -> Optional[Path]:
    for candidate in next_out_candidates():
        if (candidate / "index.html").exists():
            return candidate
    return None

def frontend_diagnostics(path: str = "", extra_error: str | None = None) -> Dict[str, Any]:
    candidates = []
    for candidate in next_out_candidates():
        try:
            candidates.append({
                "path": str(candidate),
                "exists": candidate.exists(),
                "isDir": candidate.is_dir(),
                "hasIndex": (candidate / "index.html").exists(),
                "sample": sorted([p.name for p in candidate.iterdir()][:20]) if candidate.exists() and candidate.is_dir() else [],
            })
        except Exception as exc:
            candidates.append({"path": str(candidate), "exists": False, "error": str(exc)})

    return {
        "ok": False,
        "error": extra_error or "next_static_out_not_found",
        "message": "Backend is alive, but the Next.js static export folder was not found.",
        "requestedPath": path,
        "baseDir": str(BASE_DIR),
        "cwd": os.getcwd(),
        "expectedPrimaryOut": str(NEXT_OUT_DIR),
        "candidates": candidates,
        "buildCommand": "cd app/templates/sovereign-hub-ui && npm install && npm run build && cd ../../.. && pip install -r requirements.txt",
        "renderStartCommand": "gunicorn run:app --bind 0.0.0.0:$PORT",
        "hints": [
            "Check Render build logs for `npm run build` success.",
            "For Next static export, ensure the UI build creates `app/templates/sovereign-hub-ui/out/index.html`.",
            "If using Next export, set `output: 'export'` in next.config when required.",
            "Do not set Root Directory unless your build command is adjusted for that directory.",
        ],
        "time": int(time.time()),
    }

def diagnostic_html(path: str = "", extra_error: str | None = None):
    diag = frontend_diagnostics(path, extra_error)
    diag_json = html.escape(json.dumps(diag, ensure_ascii=False, indent=2))
    return f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Malik AI Build Diagnostic</title>
</head>
<body style="margin:0;background:#030108;color:#e5faff;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
  <div style="padding:42px;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
    <div style="max-width:1100px;width:100%;">
      <h1 style="color:#ff4d7d;font-size:42px;margin:0 0 12px;">NEXT OUT NOT FOUND</h1>
      <p style="font-size:18px;color:#b8c7d9;">Backend alive, but frontend build folder is missing or index.html was not generated.</p>
      <div style="text-align:left;background:rgba(255,255,255,.06);padding:24px;border-radius:18px;border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 80px rgba(0,0,0,.35);">
        <b style="color:#facc15;">Expected primary folder:</b><br/>
        <code>{html.escape(str(NEXT_OUT_DIR))}</code><br/><br/>
        <b style="color:#67e8f9;">Render Build Command:</b><br/>
        <code>cd app/templates/sovereign-hub-ui && npm install && npm run build && cd ../../.. && pip install -r requirements.txt</code><br/><br/>
        <b>Requested path:</b> {html.escape(path)}<br/>
        <b>Diagnostics JSON:</b>
        <pre style="white-space:pre-wrap;overflow:auto;max-height:420px;background:#010207;color:#dbeafe;border-radius:14px;padding:16px;border:1px solid rgba(255,255,255,.08);">{diag_json}</pre>
      </div>
      <p style="color:#64748b;margin-top:24px;">MALIK AI Render Recovery Diagnostics</p>
    </div>
  </div>
</body>
</html>
"""

@app.route("/api/static/diagnostics", methods=["GET", "OPTIONS"])
def static_diagnostics():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify(frontend_diagnostics(request.args.get("path", "")))

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_sovereign_hub(path: str):
    # Do not catch API paths here.
    if path.startswith("api/"):
        return jsonify({"ok": False, "error": "API route not found", "path": path}), 404

    resolved_out = resolve_next_out_dir()
    if resolved_out is None:
        diag = frontend_diagnostics(path)
        log_event("error", "Next static out missing", **diag)
        wants_json = request.headers.get("accept", "").lower().find("application/json") >= 0 or request.args.get("format") == "json"
        if wants_json:
            return jsonify(diag), 404
        return diagnostic_html(path), 404

    # Serve static files directly when they exist.
    if path:
        requested = (resolved_out / path).resolve()
        try:
            requested.relative_to(resolved_out.resolve())
            if requested.exists() and requested.is_file():
                response = send_from_directory(str(resolved_out), path)
                # Sensible cache headers for immutable assets; keep index uncached.
                if "/_next/static/" in path or path.startswith("_next/static/") or path.startswith("assets/"):
                    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
                return response
        except Exception:
            return jsonify({"ok": False, "error": "invalid_static_path", "path": path}), 400

    index_path = resolved_out / "index.html"
    if index_path.exists():
        response = send_from_directory(str(resolved_out), "index.html")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response

    diag = frontend_diagnostics(path, "index_html_missing")
    log_event("error", "index.html missing in resolved frontend out", **diag)
    return diagnostic_html(path, "index_html_missing"), 404

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
