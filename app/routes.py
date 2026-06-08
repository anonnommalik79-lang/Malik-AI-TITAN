# -*- coding: utf-8 -*-
"""
🔥 MALIK NEXUS ELITE - Advanced Routing Core V7
SaaS-grade Backend: SSE Streaming, Anti-DDoS, Telemetry, Uploads & Auth
"""

import os
import uuid
import time
import html
import json
import traceback
import logging
import threading
import sqlite3
from datetime import datetime, timezone
from functools import wraps

from flask import (
    request,
    jsonify,
    session,
    Response,
    stream_with_context,
    send_from_directory,
)
from flask_cors import CORS, cross_origin
from werkzeug.security import generate_password_hash, check_password_hash

from app import app

# 🔥 Подключаем AI-ядро
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai_model import ask_malik_ai, ask_malik_ai_stream, USER_MEMORY, ADMIN_USERS  # noqa: E402

logger = logging.getLogger(__name__)

# ==================== CORS + SESSION ====================
CORS(
    app,
    resources={r"/api/*": {"origins": "*"}},
    supports_credentials=True
)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
# На HTTPS в проде поставь True
app.config["SESSION_COOKIE_SECURE"] = False


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


# ==================== CONFIG & STORAGE ====================
ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "webp", "gif",
    "mp4", "mov", "webm", "mkv",
    "mp3", "wav", "m4a", "ogg",
    "pdf"
}
MAX_UPLOAD_MB = 40
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

UPLOAD_FOLDER = os.path.join("app", "static", "storage", "photos")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
PROJECT_FOLDER = os.path.join("app", "static", "storage", "projects")
os.makedirs(PROJECT_FOLDER, exist_ok=True)

SERVER_START_TIME = time.time()

DB_PATH = os.path.join("database", "malik_users.db")
os.makedirs("database", exist_ok=True)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db():
    with db_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                last_login_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_email ON messages(email)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)")
        conn.commit()


def save_message_db(email: str, role: str, text: str):
    try:
        if not email:
            return
        ts = datetime.now(timezone.utc).isoformat()
        with db_conn() as conn:
            conn.execute(
                "INSERT INTO messages (email, role, text, created_at) VALUES (?, ?, ?, ?)",
                (email.strip().lower(), role, (text or "").strip(), ts)
            )
            conn.commit()
    except Exception as e:
        logger.warning(f"save_message_db failed: {e}")


init_auth_db()

# ==================== RATE LIMIT (ANTI-DDOS) ====================
request_counts = {}
shield_lock = threading.Lock()


def rate_limit(limit=10, per=60):
    """
    limit: max запросов
    per: окно в секундах
    """
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            ip = request.remote_addr or "unknown"
            now = time.time()
            with shield_lock:
                if ip not in request_counts:
                    request_counts[ip] = []

                request_counts[ip] = [t for t in request_counts[ip] if now - t < per]
                if len(request_counts[ip]) >= limit:
                    return jsonify({
                        "success": False,
                        "error": "RATE_LIMIT_EXCEEDED",
                        "message": "Слишком много запросов. Подождите."
                    }), 429

                request_counts[ip].append(now)

            return f(*args, **kwargs)
        return wrapped
    return decorator


# ==================== AUTH ====================
@app.route("/api/register", methods=["POST", "OPTIONS"])
@cross_origin()
@rate_limit(limit=5, per=60)
def api_register():
    if request.method == "OPTIONS":
        return "", 204

    data = request.json or {}
    email = (data.get("email") or data.get("username") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email:
        return jsonify({"success": False, "error": "MISSING_EMAIL"}), 400
    if not password:
        return jsonify({"success": False, "error": "MISSING_PASSWORD"}), 400
    if len(password) < 6:
        return jsonify({"success": False, "error": "WEAK_PASSWORD"}), 400

    master_keys = {"amangeldymalik38@gmail.com", "anonnommalik79@gmail.com"}
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        with db_conn() as conn:
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if existing:
                return jsonify({"success": False, "error": "EMAIL_ALREADY_EXISTS"}), 409

            is_admin = 1 if (email in master_keys or email in ADMIN_USERS) else 0
            conn.execute(
                "INSERT INTO users (email, password_hash, is_admin, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)",
                (email, generate_password_hash(password), is_admin, now_iso, now_iso)
            )
            conn.commit()

        session["user_email"] = email
        session["is_admin"] = bool(is_admin)

        return jsonify({
            "success": True,
            "message": "Registered successfully",
            "email": email,
            "is_admin": bool(is_admin)
        }), 201

    except Exception as e:
        logger.error(f"REGISTER ERROR: {traceback.format_exc()}")
        return jsonify({"success": False, "error": "REGISTER_FAILED", "details": str(e)}), 500


@app.route("/api/login", methods=["POST", "OPTIONS"])
@cross_origin()
@rate_limit(limit=5, per=60)
def api_login():
    if request.method == "OPTIONS":
        return "", 204

    data = request.json or {}
    email = (data.get("email") or data.get("username") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email:
        return jsonify({"success": False, "error": "MISSING_EMAIL"}), 400
    if not password:
        return jsonify({"success": False, "error": "MISSING_PASSWORD"}), 400

    master_keys = {"amangeldymalik38@gmail.com", "anonnommalik79@gmail.com"}
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        with db_conn() as conn:
            row = conn.execute(
                "SELECT email, password_hash, is_admin FROM users WHERE email = ?",
                (email,)
            ).fetchone()

            if not row:
                return jsonify({"success": False, "error": "USER_NOT_FOUND"}), 404
            if not check_password_hash(row["password_hash"], password):
                return jsonify({"success": False, "error": "INVALID_CREDENTIALS"}), 401

            conn.execute("UPDATE users SET last_login_at = ? WHERE email = ?", (now_iso, email))
            conn.commit()

        is_admin = bool(row["is_admin"]) or (email in master_keys or email in ADMIN_USERS)
        session["user_email"] = email
        session["is_admin"] = bool(is_admin)

        return jsonify({
            "success": True,
            "message": "Access granted",
            "email": email,
            "is_admin": bool(is_admin)
        }), 200

    except Exception as e:
        logger.error(f"LOGIN ERROR: {traceback.format_exc()}")
        return jsonify({"success": False, "error": "LOGIN_FAILED", "details": str(e)}), 500


@app.route("/api/logout", methods=["POST", "OPTIONS"])
@cross_origin()
def api_logout():
    if request.method == "OPTIONS":
        return "", 204
    session.clear()
    return jsonify({"success": True}), 200


@app.route("/api/session", methods=["GET", "OPTIONS"])
@cross_origin()
def api_session():
    if request.method == "OPTIONS":
        return "", 204

    email = session.get("user_email")
    if not email:
        return jsonify({"authenticated": False}), 200

    return jsonify({
        "authenticated": True,
        "email": email,
        "is_admin": bool(session.get("is_admin", False))
    }), 200


# ==================== HISTORY ====================
@app.route("/api/history", methods=["POST", "OPTIONS"])
@cross_origin()
def api_history():
    if request.method == "OPTIONS":
        return "", 204

    data = request.json or {}
    username = (data.get("username") or data.get("email") or "").strip().lower()

    is_pro = username in ADMIN_USERS or username in {
        "amangeldymalik38@gmail.com", "anonnommalik79@gmail.com"
    }

    try:
        with db_conn() as conn:
            rows = conn.execute("""
                SELECT role, text, created_at
                FROM messages
                WHERE email = ?
                ORDER BY created_at ASC
                LIMIT 300
            """, (username,)).fetchall()

        history = [
            {
                "role": r["role"],
                "text": r["text"],
                "content": r["text"],
                "ts": r["created_at"]
            }
            for r in rows
        ]

        return jsonify({
            "success": True,
            "history": history,
            "is_pro": is_pro
        }), 200

    except Exception as e:
        logger.warning(f"/api/history fallback to USER_MEMORY: {e}")
        return jsonify({
            "success": True,
            "history": USER_MEMORY.get(username, []),
            "is_pro": is_pro
        }), 200


# ==================== STREAM ====================
@app.route("/api/stream", methods=["POST", "OPTIONS"])
@cross_origin()
@rate_limit(limit=15, per=60)
def api_stream():
    if request.method == "OPTIONS":
        return "", 204

    data = request.json or {}
    prompt = (data.get("question") or "").strip()
    user = (data.get("username") or data.get("email") or "Гость").strip().lower()
    mode = (data.get("mode") or "fast").strip().lower()
    image_b64 = data.get("image_b64")
    history = data.get("history", [])

    logger.info(f"🌊 Stream Request | User: {user} | Mode: {mode.upper()} | Prompt: {prompt[:80]}")

    # Сохраняем user message в локальную БД
    if user and user != "гость" and prompt:
        save_message_db(user, "User", prompt)

    def event_stream():
        full_answer = ""
        try:
            for chunk in ask_malik_ai_stream(
                prompt=prompt,
                username=user,
                is_advanced=(mode in ["pro", "god"]),
                image_b64=image_b64,
                history=history,
                mode=mode
            ):
                # Пробуем поймать текст chunk и накапливать
                try:
                    if isinstance(chunk, str) and chunk.startswith("data: "):
                        payload = chunk[6:].strip()
                        if payload and payload != "[DONE]":
                            parsed = json.loads(payload)
                            txt = parsed.get("text") or parsed.get("content") or parsed.get("message") or ""
                            if txt:
                                full_answer += txt
                except Exception:
                    pass

                yield chunk

            # Сохраняем ответ AI в БД после завершения стрима
            if user and user != "гость" and full_answer.strip():
                save_message_db(user, "AI", full_answer.strip())

        except GeneratorExit:
            logger.warning(f"[STREAM] Клиент {user} отключился до завершения генерации.")
        except Exception as e:
            logger.error(f"[STREAM ERROR]: {traceback.format_exc()}")
            yield f'data: {json.dumps({"error": f"Внутренняя ошибка сервера: {str(e)}"}, ensure_ascii=False)}\n\n'
            yield "data: [DONE]\n\n"

    return Response(stream_with_context(event_stream()), content_type="text/event-stream")


# ==================== BUY / BILLING ====================
@app.route("/api/buy", methods=["POST", "OPTIONS"])
@cross_origin()
def api_buy():
    if request.method == "OPTIONS":
        return "", 204

    data = request.json or {}
    username = data.get("username") or data.get("email") or "unknown"
    tx_id = f"tx_{uuid.uuid4().hex[:10].upper()}"
    logger.info(f"💰 Инициация оплаты. User: {username}, TX_ID: {tx_id}")

    return jsonify({
        "success": True,
        "tx_id": tx_id,
        "message": "Ожидается ручное подтверждение платежа (Kaspi/Stripe)."
    }), 200


@app.route("/api/webhook/billing", methods=["POST"])
def billing_webhook():
    data = request.json or {}
    if request.headers.get("X-Malik-Secret") != os.environ.get("MALIK_BILLING_WEBHOOK_SECRET", "dev-secret-change-me"):
        return jsonify({"error": "Unauthorized"}), 401

    user_email = data.get("email")
    plan = data.get("plan")
    logger.info(f"[WEBHOOK] Платеж подтвержден! Выдан статус {plan} для {user_email}")

    return jsonify({"status": "upgraded"}), 200


# ==================== HEALTH / STATS ====================
@app.route("/api/health", methods=["GET", "OPTIONS"])
@cross_origin()
def health():
    if request.method == "OPTIONS":
        return "", 204

    return jsonify({
        "status": "healthy",
        "uptime_seconds": int(time.time() - SERVER_START_TIME),
        "engine": "Malik.SYS V7 Sovereign",
        "shield": "Active"
    }), 200


@app.route("/api/runtime/env-check", methods=["GET", "OPTIONS"])
@cross_origin()
def api_runtime_env_check():
    if request.method == "OPTIONS":
        return "", 204
    try:
        from app.api.generators import runtime_env_check as build_media_env_check

        payload = build_media_env_check()
        payload["storage"] = {
            "databaseUrlConfigured": bool(os.environ.get("DATABASE_URL", "").strip()),
            "supabaseUrlConfigured": bool(os.environ.get("SUPABASE_URL", "").strip()),
            "supabaseServiceRoleConfigured": bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()),
        }
        return jsonify(payload), 200
    except Exception as exc:
        logger.error(f"ENV CHECK ERROR: {traceback.format_exc()}")
        return jsonify({
            "ok": False,
            "error": "env_check_failed",
            "message": str(exc),
            "secretsExposed": False,
        }), 500


@app.route("/api/stats", methods=["GET", "OPTIONS"])
@cross_origin()
def stats():
    if request.method == "OPTIONS":
        return "", 204
    try:
        import psutil
        return jsonify({
            "status": "success",
            "data": {
                "cpu_usage": psutil.cpu_percent(interval=0.15),
                "ram_usage": psutil.virtual_memory().percent,
                "disk_usage": psutil.disk_usage("/").percent,
                "active_threads": threading.active_count(),
                "uptime_hours": round((time.time() - SERVER_START_TIME) / 3600, 2),
                "timestamp": int(time.time())
            }
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500


# ==================== FALLBACK /api/ask ====================
@app.route("/api/ask", methods=["POST", "OPTIONS"])
@cross_origin()
@rate_limit(limit=10, per=60)
def api_ask():
    if request.method == "OPTIONS":
        return "", 204

    image_path = None
    try:
        if request.is_json:
            data = request.json or {}
            question = (data.get("question") or "").strip()
            username = (data.get("username") or data.get("email") or "Гость").strip().lower()
            mode = (data.get("mode") or "fast").strip().lower()
        else:
            question = (request.form.get("question") or "").strip()
            username = (request.form.get("username") or request.form.get("email") or "Гость").strip().lower()
            mode = (request.form.get("mode") or "fast").strip().lower()

            media = request.files.get("image") or request.files.get("file")
            if media and media.filename and allowed_file(media.filename):
                ext = media.filename.rsplit(".", 1)[1].lower()
                image_path = os.path.join(app.config["UPLOAD_FOLDER"], f"scan_{uuid.uuid4().hex}.{ext}")
                media.save(image_path)

        if username and username != "гость" and question:
            save_message_db(username, "User", question)

        response = ask_malik_ai(
            prompt=question,
            username=username,
            is_advanced=(mode in ["pro", "god"]),
            image_b64=image_path,
            mode=mode
        )

        # Сохраним AI ответ, если есть
        try:
            ai_text = ""
            if isinstance(response, dict):
                ai_text = response.get("text") or response.get("message") or response.get("content") or ""
            elif isinstance(response, str):
                ai_text = response
            if username and username != "гость" and ai_text:
                save_message_db(username, "AI", ai_text)
        except Exception:
            pass

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"❌ /api/ask Error: {traceback.format_exc()}")
        return jsonify({"status": "error", "error": str(e)}), 500
    finally:
        if image_path and os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception:
                pass


# ==================== SOVEREIGN GENERATORS / SAFE FALLBACKS ====================
def _fallback_html(kind: str, prompt: str) -> str:
    safe_prompt = html.escape((prompt or f"Malik AI {kind}").strip()[:140])
    return f"""<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#030303] text-white">
  <main class="min-h-screen px-6 py-16">
    <section class="mx-auto flex min-h-[80vh] max-w-6xl flex-col justify-center">
      <div class="w-fit rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-bold text-violet-200">Malik AI {kind.title()}</div>
      <h1 class="mt-8 text-5xl font-black md:text-7xl">{safe_prompt}</h1>
      <p class="mt-6 max-w-2xl text-zinc-300">Safe local fallback artifact connected to backend endpoint and canvas preview.</p>
      <div class="mt-10 grid gap-4 md:grid-cols-3">
        <div class="rounded-3xl border border-white/10 bg-white/[.05] p-6">UI panel connected</div>
        <div class="rounded-3xl border border-white/10 bg-white/[.05] p-6">Backend hook ready</div>
        <div class="rounded-3xl border border-white/10 bg-white/[.05] p-6">Render safe fallback</div>
      </div>
    </section>
  </main>
</body>
</html>"""


def _photo_svg(prompt: str, style: str, size: str, quality: str):
    filename = f"malik_photo_{int(time.time())}_{uuid.uuid4().hex[:8]}.svg"
    safe_prompt = html.escape((prompt or "Malik AI premium photo").strip()[:220])
    target = os.path.join(UPLOAD_FOLDER, filename)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><radialGradient id="g" cx="30%" cy="15%" r="80%"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="55%" stop-color="#111827"/><stop offset="100%" stop-color="#020617"/></radialGradient></defs>
<rect width="1024" height="1024" fill="url(#g)"/><circle cx="760" cy="260" r="220" fill="#22d3ee" opacity=".2"/>
<rect x="104" y="122" width="816" height="780" rx="64" fill="#030712" opacity=".75" stroke="#22d3ee" stroke-width="3"/>
<text x="150" y="236" fill="#fff" font-family="Arial" font-size="42" font-weight="900">Malik AI Photo</text>
<text x="150" y="294" fill="#a5b4fc" font-family="Arial" font-size="22">{html.escape(style)} / {html.escape(quality)} / {html.escape(size)}</text>
<foreignObject x="150" y="610" width="724" height="190"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;color:white;font-size:34px;font-weight:900;line-height:1.15;">{safe_prompt}</div></foreignObject>
</svg>"""
    with open(target, "w", encoding="utf-8") as f:
        f.write(svg)
    return filename


@app.route("/api/storage/photos/<path:filename>", methods=["GET"])
@cross_origin()
def api_storage_photo(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/api/generate/photo", methods=["POST", "OPTIONS"])
@cross_origin()
def api_generate_photo():
    if request.method == "OPTIONS":
        return "", 204
    data = request.json or {}
    try:
        from app.api.generators import generate_media_response

        payload, status = generate_media_response(
            "photo",
            data,
            storage_dir=UPLOAD_FOLDER,
            public_storage_prefix="/api/storage/photos",
            client_id=request.remote_addr or "guest",
        )
        return jsonify(payload), status
    except Exception:
        logger.warning(f"media photo provider helper failed: {traceback.format_exc()}")
    filename = _photo_svg(data.get("prompt") or "", data.get("style") or "cinematic", data.get("size") or "1024x1024", data.get("quality") or "high")
    gallery = [f"/api/storage/photos/{name}" for name in sorted(os.listdir(UPLOAD_FOLDER))[-12:]]
    return jsonify({"ok": True, "kind": "photo", "fallback": True, "filename": filename, "url": f"/api/storage/photos/{filename}", "gallery": gallery})


def _api_generate_kind(kind: str):
    if request.method == "OPTIONS":
        return "", 204
    data = request.json or {}
    code = _fallback_html(kind, data.get("prompt") or "")
    return jsonify({"ok": True, "kind": kind, "fallback": True, "code": code, "files": [{"path": f"generated/{kind}.html", "language": "html", "content": code}]})


@app.route("/api/generate/video", methods=["POST", "OPTIONS"])
@cross_origin()
def api_generate_video():
    if request.method == "OPTIONS":
        return "", 204
    data = request.json or {}
    try:
        from app.api.generators import generate_media_response

        payload, status = generate_media_response(
            "video",
            data,
            storage_dir=UPLOAD_FOLDER,
            public_storage_prefix="/api/storage/photos",
            client_id=request.remote_addr or "guest",
        )
        return jsonify(payload), status
    except Exception:
        logger.warning(f"media video provider helper failed: {traceback.format_exc()}")
    code = _fallback_html("video", data.get("prompt") or "")
    return jsonify({"ok": True, "kind": "video", "fallback": True, "code": code, "files": [{"path": "generated/video.html", "language": "html", "content": code}]})


@app.route("/api/generate/code", methods=["POST", "OPTIONS"])
@cross_origin()
def api_generate_code():
    return _api_generate_kind("code")


@app.route("/api/generate/website", methods=["POST", "OPTIONS"])
@cross_origin()
def api_generate_website():
    return _api_generate_kind("website")


@app.route("/api/projects/save", methods=["POST", "OPTIONS"])
@cross_origin()
def api_projects_save():
    if request.method == "OPTIONS":
        return "", 204
    data = request.json or {}
    project_id = data.get("id") or f"project_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    target = os.path.join(PROJECT_FOLDER, f"{project_id}.json")
    payload = {"ok": True, "id": project_id, "title": data.get("title") or "Untitled Malik Project", "data": data}
    with open(target, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return jsonify({**payload, "path": target})


@app.route("/api/templates", methods=["GET", "OPTIONS"])
@cross_origin()
def api_templates():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({"ok": True, "templates": [
        {"id": "photo-cinematic", "title": "Cinematic Photo", "category": "Photo Generation", "prompt": "Generate a cinematic premium product photo"},
        {"id": "saas-landing", "title": "SaaS Landing", "category": "Website Builder", "prompt": "Generate a premium SaaS landing page"},
        {"id": "react-component", "title": "React Component", "category": "Code Generation", "prompt": "Generate a polished React component"},
    ]})



# ==================== MALIK CORE PACK V2: STATUS / ROUTER / PROJECTS ====================
def _json_payload() -> Dict[str, Any]:
    try:
        return request.get_json(silent=True) or {}
    except Exception:
        return {}


def _safe_project_id(value: str) -> str:
    clean = "".join(ch for ch in str(value or "") if ch.isalnum() or ch in {"_", "-"}).strip()
    return clean[:80] or f"project_{uuid.uuid4().hex[:8]}"


@app.route("/api/env-check", methods=["GET", "OPTIONS"])
@cross_origin()
def api_env_check_alias():
    """Alias for frontend status widgets. Never exposes secret values."""
    if request.method == "OPTIONS":
        return "", 204
    try:
        from app.api import build_runtime_status
        from app.api.generators import runtime_env_check as build_media_env_check
        from app.ai.router import ai_router

        media = build_media_env_check()
        ai = ai_router.status()
        return jsonify(build_runtime_status({
            "media": media.get("media", media),
            "mediaProviders": media.get("providers", []),
            "ai": ai,
            "storage": {
                "databaseUrlConfigured": bool(os.environ.get("DATABASE_URL", "").strip()),
                "supabaseUrlConfigured": bool(os.environ.get("SUPABASE_URL", "").strip() or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()),
                "supabaseServiceRoleConfigured": bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()),
            },
        })), 200
    except Exception as exc:
        logger.error(f"ENV CHECK ALIAS ERROR: {traceback.format_exc()}")
        return jsonify({"ok": False, "error": "env_check_failed", "message": str(exc), "secretsExposed": False}), 500


@app.route("/api/media/status", methods=["GET", "OPTIONS"])
@app.route("/api/generate/status", methods=["GET", "OPTIONS"])
@cross_origin()
def api_media_status():
    if request.method == "OPTIONS":
        return "", 204
    try:
        from app.api.generators import media_runtime_status, configured_media_summary
        return jsonify({
            "ok": True,
            "status": "ready",
            "media": configured_media_summary(),
            "runtime": media_runtime_status(),
            "secretsExposed": False,
        }), 200
    except Exception as exc:
        logger.error(f"MEDIA STATUS ERROR: {traceback.format_exc()}")
        return jsonify({"ok": False, "error": "media_status_failed", "message": str(exc), "secretsExposed": False}), 500


@app.route("/api/ai/status", methods=["GET", "OPTIONS"])
@cross_origin()
def api_ai_status():
    if request.method == "OPTIONS":
        return "", 204
    try:
        from app.ai.router import ai_router
        return jsonify(ai_router.status()), 200
    except Exception as exc:
        logger.error(f"AI STATUS ERROR: {traceback.format_exc()}")
        return jsonify({"ok": False, "error": "ai_status_failed", "message": str(exc), "secretsExposed": False}), 500


@app.route("/api/ai/route", methods=["POST", "OPTIONS"])
@cross_origin()
@rate_limit(limit=20, per=60)
def api_ai_route():
    """Fast text router endpoint. Media prompts are routed to media endpoints."""
    if request.method == "OPTIONS":
        return "", 204
    data = _json_payload()
    prompt = (data.get("prompt") or data.get("question") or data.get("message") or "").strip()
    mode = (data.get("mode") or "chat").strip().lower()
    user = (data.get("username") or data.get("email") or data.get("userEmail") or "guest").strip().lower()
    history = data.get("history") if isinstance(data.get("history"), list) else []

    if not prompt:
        return jsonify({"ok": False, "error": "missing_prompt", "message": "Prompt is required."}), 400

    if len(prompt) > int(os.environ.get("MAX_PROMPT_CHARS", "12000") or 12000):
        return jsonify({"ok": False, "error": "prompt_too_long", "message": "Prompt is too long."}), 413

    try:
        from app.ai.router import ai_router
        payload = ai_router.route(prompt, mode=mode, history=history, user=user)
        return jsonify(payload), 200
    except Exception as exc:
        logger.error(f"AI ROUTE ERROR: {traceback.format_exc()}")
        return jsonify({"ok": False, "error": "ai_route_failed", "message": str(exc)}), 500


@app.route("/api/projects/list", methods=["GET", "OPTIONS"])
@cross_origin()
def api_projects_list():
    if request.method == "OPTIONS":
        return "", 204
    try:
        items = []
        for filename in sorted(os.listdir(PROJECT_FOLDER), reverse=True)[:80]:
            if not filename.endswith(".json"):
                continue
            path = os.path.join(PROJECT_FOLDER, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                items.append({
                    "id": data.get("id") or filename[:-5],
                    "title": data.get("title") or "Untitled Malik Project",
                    "updatedAt": datetime.fromtimestamp(os.path.getmtime(path), timezone.utc).isoformat(),
                    "path": filename,
                })
            except Exception:
                continue
        return jsonify({"ok": True, "projects": items, "count": len(items)}), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": "projects_list_failed", "message": str(exc)}), 500


@app.route("/api/projects/<project_id>", methods=["GET", "DELETE", "OPTIONS"])
@cross_origin()
def api_project_detail(project_id):
    if request.method == "OPTIONS":
        return "", 204
    safe_id = _safe_project_id(project_id)
    path = os.path.join(PROJECT_FOLDER, f"{safe_id}.json")

    if request.method == "DELETE":
        try:
            if os.path.exists(path):
                os.remove(path)
            return jsonify({"ok": True, "deleted": safe_id}), 200
        except Exception as exc:
            return jsonify({"ok": False, "error": "project_delete_failed", "message": str(exc)}), 500

    if not os.path.exists(path):
        return jsonify({"ok": False, "error": "project_not_found", "id": safe_id}), 404
    try:
        with open(path, "r", encoding="utf-8") as f:
            return jsonify(json.load(f)), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": "project_read_failed", "message": str(exc)}), 500


@app.route("/api/health/full", methods=["GET", "OPTIONS"])
@cross_origin()
def api_health_full():
    if request.method == "OPTIONS":
        return "", 204
    payload = {
        "ok": True,
        "status": "healthy",
        "engine": "Malik.SYS V7 Sovereign",
        "uptimeSeconds": int(time.time() - SERVER_START_TIME),
        "threads": threading.active_count(),
        "storage": {
            "uploadFolderReady": os.path.isdir(UPLOAD_FOLDER),
            "projectFolderReady": os.path.isdir(PROJECT_FOLDER),
            "dbPathReady": os.path.exists(DB_PATH),
        },
        "secretsExposed": False,
    }
    return jsonify(payload), 200

try:
    from app.codex.router import register_codex_routes
    register_codex_routes(app)
except Exception as codex_route_error:
    logger.warning(f"Malik Codex routes skipped: {codex_route_error}")
