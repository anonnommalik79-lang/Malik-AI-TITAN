# -*- coding: utf-8 -*-
"""
================================================================================
  MALIK AI SOVEREIGN V7 — ABSOLUTE CORE ORCHESTRATION ENGINE
================================================================================

  ⚡  God-Tier Multi-Provider Cascading AI Engine
  ⚡  Author: Abdumalik (MALIK) — Sovereign Architect
  ⚡  Version: SOVEREIGN V7.3.0 (Awwwards / Vercel-Grade Backend)
  ⚡  Python: 3.10+
  ⚡  Streaming: SSE (Server-Sent Events) compatible with /api/stream frontend
  ⚡  Providers (cascade order):
        1) GROQ            (Llama 3.3 70B versatile — supersonic primary)
        2) GITHUB MODELS   (DeepSeek-V3 / GPT-4o — code & reasoning)
        3) OPENAI DIRECT   (GPT-4o-mini — universal fallback)
        4) GOOGLE GEMINI   (gemini-1.5-flash — last-resort backbone)
  ⚡  Media:
        • Stability AI v2 Core (PNG generation)
        • Pollinations (free unlimited fallback)
        • Whisper-Large-V3-Turbo (Groq) for ASR
        • GPT-4o Vision + Llama-Vision (Groq) for image understanding
  ⚡  Memory:
        • JSON local store (db_memory.json / db_limits.json)
        • Optional PostgreSQL (DATABASE_URL) with automatic schema migration
        • In-memory LRU + relevance-scored recall
  ⚡  Brand Shielding:
        • Massive regex sweep replacing every foreign brand
          (OpenAI / ChatGPT / GPT / Claude / Gemini / Llama / Anthropic / etc.)
          with “MALIK AI SOVEREIGN V7”.
  ⚡  GOD PROMPT:
        • The AI is FORBIDDEN from leaking raw code into the chat surface.
        • Code generations are wrapped in ONE single fenced block and
          announced with: ✨ Интерфейс успешно сгенерирован
  ⚡  Resilience:
        • Per-key circuit breaker with cooldown
        • Provider health monitor with adaptive scoring
        • Structured logger (MALIK_LOG_LEVEL)
        • Graceful degradation across all layers

  SECURITY: API keys must live in Render Environment Variables or MALIK_KEYS_JSON, not GitHub code.
  Re-load keys at runtime: reload_malik_()
  Diagnostics:             malik_diagnostics()
  List capabilities:       list_capabilities()
================================================================================
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import queue
import random
import re
import sys
import sqlite3
import threading
import time
import traceback
import urllib.parse
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import (
    Any,
    AsyncGenerator,
    Callable,
    Deque,
    Dict,
    Iterable,
    List,
    Optional,
    Tuple,
    Union,
)

# ============================================================================
# OPTIONAL DEPENDENCIES (graceful degradation)
# ============================================================================
try:
    import aiohttp

    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False

try:
    import faiss  # noqa: F401
    import numpy as np  # noqa: F401
    from sentence_transformers import SentenceTransformer

    embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    HAS_VECTOR_DB = True
except ImportError:
    HAS_VECTOR_DB = False
    embed_model = None

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor  # noqa: F401

    HAS_DB = True
except ImportError:
    HAS_DB = False

try:
    import bcrypt  # noqa: F401

    HAS_BCRYPT = True
except ImportError:
    HAS_BCRYPT = False


# ============================================================================
# PATHS & CONSTANTS
# ============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp_files")
LOG_DIR = os.path.join(BASE_DIR, "logs")
DB_FILE = os.path.join(BASE_DIR, "db_limits.json")
MEMORY_FILE = os.path.join(BASE_DIR, "db_memory.json")
METRICS_FILE = os.path.join(BASE_DIR, "db_metrics.json")
HEALTH_FILE = os.path.join(BASE_DIR, "db_health.json")
# os.makedirs(TEMP_DIR, exist_ok=True)
# os.makedirs(LOG_DIR, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL")

# Show short status lines ("ядро обрабатывает…") — 0 = silent (ChatGPT-like)
STREAM_STATUS_LINES = os.environ.get("MALIK_STREAM_STATUS", "0") == "1"

# mode=god → multi-step orchestration by default; MALIK_GOD_LIGHT=1 disables it
_god_full_legacy = os.environ.get("MALIK_GOD_FULL")
if _god_full_legacy is not None and str(_god_full_legacy).strip() != "":
    MALIK_GOD_LIGHT = str(_god_full_legacy).strip() != "1"
else:
    MALIK_GOD_LIGHT = os.environ.get("MALIK_GOD_LIGHT", "0") == "1"

# Gemini text-fallback model
MALIK_GEMINI_MODEL = os.environ.get("MALIK_GEMINI_MODEL", "gemini-1.5-flash")

# Direct OpenAI chat model (same key family as vision) — used after GitHub
MALIK_OPENAI_TEXT_MODEL = os.environ.get("MALIK_OPENAI_TEXT_MODEL", "gpt-4o-mini")

# Prefer Stability over Pollinations for image generation
MALIK_STABILITY_FIRST = os.environ.get("MALIK_STABILITY_FIRST", "0") == "1"

# Stability v2 endpoint
STABILITY_GENERATE_URL = (
    "https://api.stability.ai/v2beta/stable-image/generate/core"
)

# Brand shielding (0 = leave raw text untouched)
POST_PROCESS_BRAND_SHIELD = os.environ.get("MALIK_BRAND_SHIELD", "0") == "1"

# Per-user rolling rate limit (msgs / hour) — admins bypass
MALIK_RATE_LIMIT_PER_HOUR = int(os.environ.get("MALIK_RATE_LIMIT_PER_HOUR", "30"))

# Global circuit breaker — open after N consecutive failures
MALIK_CB_THRESHOLD = int(os.environ.get("MALIK_CB_THRESHOLD", "5"))
MALIK_CB_RESET_SECONDS = int(os.environ.get("MALIK_CB_RESET_SECONDS", "120"))

# Max stored memory entries per user
MALIK_MEMORY_MAX = int(os.environ.get("MALIK_MEMORY_MAX", "100"))

# Code-block extraction safety net (cap)
MALIK_MAX_CODE_BLOCK_KB = int(os.environ.get("MALIK_MAX_CODE_BLOCK_KB", "512"))

# Local key vault
LOCAL_KEYS_PATH = os.environ.get(
    "MALIK_KEYS_JSON", os.path.join(BASE_DIR, "malik_keys.local.json")
)
_LOCAL_KEYS_DATA: Optional[dict] = None


# ============================================================================
# STRUCTURED LOGGER
# ============================================================================
def _build_logger() -> logging.Logger:
    lvl_name = os.environ.get("MALIK_LOG_LEVEL", "INFO").upper()
    lvl = getattr(logging, lvl_name, logging.INFO)

    logger = logging.getLogger("malik.sovereign")
    logger.setLevel(lvl)
    logger.propagate = False

    if logger.handlers:
        return logger

    fmt = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-7s | MALIK | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    try:
        fh = logging.FileHandler(
            os.path.join(LOG_DIR, "malik_sovereign.log"),
            encoding="utf-8",
        )
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    except Exception:
        pass

    return logger


log = _build_logger()
log.info("MALIK SOVEREIGN V7 boot | aiohttp=%s | postgres=%s | vector=%s",
         HAS_AIOHTTP, HAS_DB, HAS_VECTOR_DB)


# ============================================================================
# KEY VAULT LOADER
# ============================================================================
def _load_local_keys_file() -> dict:
    global _LOCAL_KEYS_DATA
    if _LOCAL_KEYS_DATA is not None:
        return _LOCAL_KEYS_DATA
    _LOCAL_KEYS_DATA = {}
    if LOCAL_KEYS_PATH and os.path.isfile(LOCAL_KEYS_PATH):
        try:
            with open(LOCAL_KEYS_PATH, "r", encoding="utf-8") as _f:
                _LOCAL_KEYS_DATA = json.load(_f)
        except Exception as e:
            log.warning("Local key vault unreadable: %s", e)
            _LOCAL_KEYS_DATA = {}
    if not isinstance(_LOCAL_KEYS_DATA, dict):
        _LOCAL_KEYS_DATA = {}
    return _LOCAL_KEYS_DATA


ADMIN_USERS = [
    x.strip().lower()
    for x in os.environ.get(
        "MALIK_ADMIN_USERS",
        "amangeldymalik38@gmail.com,anonnommalik79@gmail.com,admin,malik,abdumalik",
    ).split(",")
    if x.strip()
]


# ============================================================================
# COOLDOWNS, CIRCUIT BREAKER & HEALTH MONITOR
# ============================================================================
KEY_COOLDOWNS: Dict[str, float] = {}
KEY_FAILURES: Dict[str, int] = defaultdict(int)
KEY_SUCCESSES: Dict[str, int] = defaultdict(int)
KEY_LAST_LATENCY: Dict[str, float] = {}
PROVIDER_HEALTH: Dict[str, Dict[str, Any]] = {}

_health_lock = threading.Lock()


def _provider_record(provider: str, ok: bool, latency: float) -> None:
    with _health_lock:
        rec = PROVIDER_HEALTH.setdefault(
            provider,
            {
                "ok": 0,
                "fail": 0,
                "last_latency_ms": 0,
                "avg_latency_ms": 0.0,
                "last_seen": 0,
                "circuit_open": False,
                "circuit_opened_at": 0,
            },
        )
        if ok:
            rec["ok"] += 1
            rec["circuit_open"] = False
        else:
            rec["fail"] += 1
            if rec["fail"] >= MALIK_CB_THRESHOLD:
                rec["circuit_open"] = True
                rec["circuit_opened_at"] = time.time()
        rec["last_latency_ms"] = int(latency * 1000)
        # exponential moving average
        prev = rec["avg_latency_ms"] or rec["last_latency_ms"]
        rec["avg_latency_ms"] = (prev * 0.75) + (rec["last_latency_ms"] * 0.25)
        rec["last_seen"] = int(time.time())


def _provider_is_open(provider: str) -> bool:
    rec = PROVIDER_HEALTH.get(provider)
    if not rec:
        return False
    if not rec.get("circuit_open"):
        return False
    if time.time() - rec.get("circuit_opened_at", 0) > MALIK_CB_RESET_SECONDS:
        # half-open: allow one attempt
        rec["circuit_open"] = False
        rec["fail"] = 0
        log.info("Circuit breaker half-open for %s", provider)
        return False
    return True


def _mark_(key: str, cooldown_seconds: int = 30) -> None:
    KEY_FAILURES[key] += 1
    KEY_COOLDOWNS[key] = time.time() + cooldown_seconds


def _mark_(key: str, latency: float) -> None:
    KEY_SUCCESSES[key] += 1
    KEY_LAST_LATENCY[key] = latency
    KEY_COOLDOWNS.pop(key, None)
    KEY_FAILURES[key] = 0


# ============================================================================
# KEY ACCESSORS
# ============================================================================
def _is_real_(value: str) -> bool:
    """Ignore empty/demo placeholders while allowing 1..5 real keys per service."""
    v = str(value or "").strip()
    if not v:
        return False
    bad_markers = (
        "Here", "PASTE_", "YOUR_", "PUT_", "REPLACE_", "KEY_",
        "api_key_", "example", "demo", "none", "null",
    )
    return not any(marker.lower() in v.lower() for marker in bad_markers)


def get_keys(
    env_var_name: str, default_keys: Optional[List[str]] = None
) -> List[str]:
    """
    Multi-key loader.

    Priority:
    1) Render/OS env var: SERVICE_KEYS=key1,key2,key3,key4,key5
    2) local JSON vault MALIK_KEYS_JSON
    3) inline slots below, if you manually paste keys there

    Empty placeholders are ignored automatically.
    """
    raw = os.environ.get(env_var_name)
    if raw and raw.strip():
        return [k.strip() for k in raw.split(",") if _is_real_(k)]

    blob = _load_local_keys_file()
    if env_var_name in blob:
        entry = blob[env_var_name]
        if isinstance(entry, list):
            return [str(k).strip() for k in entry if _is_real_(str(k))]
        if isinstance(entry, str) and entry.strip():
            return [k.strip() for k in entry.split(",") if _is_real_(k)]

    if default_keys:
        return [str(k).strip() for k in default_keys if _is_real_(str(k))]
    return []


# ============================================================================
# TITAN KEY INTEGRATION — WORLD-LEVEL MULTI-KEY SLOTS + ROLE ROUTER
# ============================================================================
# Ты можешь поставить ДО 5 API-ключей на каждый сервис.
# Лучший способ — Render Environment:
#   GITHUB_KEYS=key1,key2,key3,key4,key5
#   GROQ_KEYS=key1,key2,key3,key4,key5
#   GEMINI_KEYS=key1,key2,key3,key4,key5
#   OPENAI_VISION_KEYS=key1,key2,key3,key4,key5
#   STABILITY_KEYS=key1,key2,key3,key4,key5
#   RUNWAY_KEYS=key1,key2,key3,key4,key5
#   VOICE_KEYS=key1,key2,key3,key4,key5
#   OPENAI_API_KEY=key
#   OPENROUTER_API_KEY=key
#   ANTHROPIC_API_KEY=key
#   REPLICATE_API_TOKEN=key
#   AWS_REGION=us-east-1
#   AWS_ACCESS_KEY_ID=key
#   AWS_SECRET_ACCESS_KEY=secret
#   AZURE_OPENAI_ENDPOINT=https://...
#   AZURE_OPENAI_KEY=key
#   AZURE_OPENAI_DEPLOYMENT=name
#
# Если хочешь вручную — вставляй ключи в пустые строки ниже.
# Пустые строки и PASTE_* игнорируются, реальные ключи работают.

# 1. GITHUB TITANS — GPT/DeepSeek/Llama через GitHub Models
# Роли:
#   GPT-4o      → reasoning / обычные сильные ответы
#   DeepSeek-V3 → код / сайты / архитектура
#   Llama       → support fallback
GITHUB_KEYS = get_keys("GITHUB_KEYS", [
    "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",  # GITHUB_KEY_1
    "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",  # GITHUB_KEY_2
    "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",  # GITHUB_KEY_3
    "",  # GITHUB_KEY_4
    "",  # GITHUB_KEY_5
])

# 2. STABILITY AI — генерация фото
STABILITY_KEYS = get_keys("STABILITY_KEYS", [
    "sk-RyEV7lMMgdG7rY0oYaVq2kT613oQx7x638iGfO97OkJavSSv",  # STABILITY_KEY_1
    "sk-O2ba9PceIcOW0Idrjukn20pzrCjcOG3y4JhGAG7mAAJaqzlR",  # STABILITY_KEY_2
    "sk_0f5d331d4caf5ea693ae4fc706ad1c3fed486a1f9cd6f1e2",  # STABILITY_KEY_3
    "",  # STABILITY_KEY_4
    "",  # STABILITY_KEY_5
])

# 3. RUNWAY — генерация видео
RUNWAY_KEYS = get_keys("RUNWAY_KEYS", [
    "key_fe20192dee8f189bd18232547fbb7ade28435a183796c4090154a603031d524bf09ba0f594a7ae2963101c1a3d6dc03000a6c97d53becb455f2aa0f39c8ed31e",  # RUNWAY_KEY_1
    "",  # RUNWAY_KEY_2
    "",  # RUNWAY_KEY_3
    "",  # RUNWAY_KEY_4
    "",  # RUNWAY_KEY_5
])

# 4. ELEVENLABS — голос / TTS
VOICE_KEYS = get_keys("VOICE_KEYS", [
    "",  # VOICE_KEY_1
    "",  # VOICE_KEY_2
    "",  # VOICE_KEY_3
    "",  # VOICE_KEY_4
    "",  # VOICE_KEY_5
])

# 5. GOOGLE GEMINI — чтение фото/видео + text fallback
GEMINI_KEYS = get_keys("GEMINI_KEYS", [
    "AIzaSyCtW9zzxACYhflBjkYRVoO6F6hWPLCMX9g",  # GEMINI_KEY_1
    "",  # GEMINI_KEY_2
    "",  # GEMINI_KEY_3
    "",  # GEMINI_KEY_4
    "",  # GEMINI_KEY_5
])

# 6. GROQ — скорость / быстрый chat / ASR / fast fallback
GROQ_KEYS = get_keys("GROQ_KEYS", [
    "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",  # GROQ_KEY_1
    "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",  # GROQ_KEY_2
    "",  # GROQ_KEY_3
    "",  # GROQ_KEY_4
    "",  # GROQ_KEY_5
])

# 7. OPENAI VISION — запасной vision / universal fallback
OPENAI_VISION_KEYS = get_keys("OPENAI_VISION_KEYS", [
    "",  # OPENAI_VISION_KEY_1
    "",  # OPENAI_VISION_KEY_2
    "",  # OPENAI_VISION_KEY_3
    "",  # OPENAI_VISION_KEY_4
    "",  # OPENAI_VISION_KEY_5
])

# 7. OPENAI VISION — запасной vision / universal fallback
OPENAI_VISION_KEYS = get_keys("OPENAI_VISION_KEYS", [
    "",  # OPENAI_VISION_KEY_1
    "",  # OPENAI_VISION_KEY_2
    "",  # OPENAI_VISION_KEY_3
    "",  # OPENAI_VISION_KEY_4
    "",  # OPENAI_VISION_KEY_5
])


# 8. WORLD TITANS — env-only slots for providers added after the original core.
# These keys are intentionally NOT hardcoded. Put them in Render Environment.
OPENAI_KEYS = get_keys("OPENAI_API_KEY", []) or get_keys("OPENAI_KEYS", []) or OPENAI_VISION_KEYS
OPENROUTER_KEYS = get_keys("OPENROUTER_API_KEY", []) or get_keys("OPENROUTER_KEYS", [])
ANTHROPIC_KEYS = get_keys("ANTHROPIC_API_KEY", []) or get_keys("CLAUDE_KEYS", [])
REPLICATE_KEYS = get_keys("REPLICATE_API_TOKEN", []) or get_keys("REPLICATE_KEYS", [])
AZURE_OPENAI_KEYS = get_keys("AZURE_OPENAI_KEY", [])
AWS_BEDROCK_KEYS = get_keys("AWS_ACCESS_KEY_ID", [])
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "").strip()
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1").strip()
AWS_BEDROCK_TEXT_MODEL = os.environ.get("AWS_BEDROCK_TEXT_MODEL", "").strip()
AWS_BEDROCK_IMAGE_MODEL = os.environ.get("AWS_BEDROCK_IMAGE_MODEL", "amazon.nova-canvas-v1:0").strip()
AWS_BEDROCK_VIDEO_MODEL = os.environ.get("AWS_BEDROCK_VIDEO_MODEL", "amazon.nova-reel-v1:0").strip()

KEY_INDEX = {
    "GITHUB": 0,
    "GEMINI": 0,
    "GROQ": 0,
    "STABILITY": 0,
    "RUNWAY": 0,
    "VOICE": 0,
    "OPENAI_VISION": 0,
    "OPENAI": 0,
    "OPENROUTER": 0,
    "ANTHROPIC": 0,
    "REPLICATE": 0,
    "AZURE_OPENAI": 0,
    "AWS_BEDROCK": 0,
}

# ============================================================================
# MODEL ROLES — КТО ЗА ЧТО ОТВЕЧАЕТ
# ============================================================================
MODEL_ROLES: Dict[str, Dict[str, str]] = {
    "fast_chat": {
        "provider": "groq",
        "model": os.environ.get("MALIK_GROQ_FAST_MODEL", "llama-3.3-70b-versatile"),
        "purpose": "скорость, короткий live chat, первичная реакция",
    },
    "reasoning": {
        "provider": "github",
        "model": os.environ.get("MALIK_GITHUB_REASONING_MODEL", "gpt-4o"),
        "purpose": "сильные ответы, рассуждение, объяснение",
    },
    "code": {
        "provider": "github",
        "model": os.environ.get("MALIK_GITHUB_CODE_MODEL", "DeepSeek-V3"),
        "purpose": "код, сайты, canvas, debug, архитектура",
    },
    "support": {
        "provider": "github",
        "model": os.environ.get("MALIK_GITHUB_SUPPORT_MODEL", "Llama-3.3-70B-Instruct"),
        "purpose": "резервная поддержка",
    },
    "gemini_vision": {
        "provider": "gemini",
        "model": os.environ.get("MALIK_GEMINI_VISION_MODEL", "gemini-1.5-pro"),
        "purpose": "чтение фото/видео/файлов",
    },
    "openai_vision": {
        "provider": "openai",
        "model": os.environ.get("MALIK_OPENAI_VISION_MODEL", "gpt-4o"),
        "purpose": "резервный vision анализ",
    },
    "openai_text": {
        "provider": "openai",
        "model": MALIK_OPENAI_TEXT_MODEL,
        "purpose": "универсальный fallback",
    },
    "gemini_text": {
        "provider": "gemini",
        "model": MALIK_GEMINI_MODEL,
        "purpose": "последний текстовый fallback",
    },
    "image_gen": {
        "provider": "stability",
        "model": os.environ.get("MALIK_STABILITY_MODEL", "stable-image-core"),
        "purpose": "генерация фото",
    },
    "video_gen": {
        "provider": "runway",
        "model": os.environ.get("MALIK_RUNWAY_MODEL", "gen3"),
        "purpose": "генерация видео",
    },
    "voice": {
        "provider": "elevenlabs",
        "model": os.environ.get("MALIK_VOICE_MODEL", "eleven_multilingual_v2"),
        "purpose": "озвучка",
    },
}


def _log_() -> None:
    log.info(
        "KEYS LOADED | groq=%d github=%d gemini=%d openai=%d stability=%d runway=%d voice=%d",
        len(GROQ_KEYS),
        len(GITHUB_KEYS),
        len(GEMINI_KEYS),
        len(OPENAI_VISION_KEYS),
        len(STABILITY_KEYS),
        len(RUNWAY_KEYS),
        len(VOICE_KEYS),
    )
    log.info(
        "MODEL ROLES | fast=%s | reasoning=%s | code=%s | vision=%s | image=%s | video=%s",
        MODEL_ROLES["fast_chat"]["model"],
        MODEL_ROLES["reasoning"]["model"],
        MODEL_ROLES["code"]["model"],
        MODEL_ROLES["gemini_vision"]["model"],
        MODEL_ROLES["image_gen"]["model"],
        MODEL_ROLES["video_gen"]["model"],
    )


def choose_ai_role(prompt: str, media_b64: Optional[str] = None, media_type: str = "", hints: Optional["RouteHints"] = None) -> str:
    """World-level task router: chooses the best specialist before provider cascade."""
    text = (prompt or "").lower().strip()

    if media_b64 and media_type.startswith("image/"):
        return "gemini_vision"
    if media_b64 and media_type.startswith("video/"):
        return "gemini_vision"
    if media_b64 and media_type.startswith("audio/"):
        return "voice"

    if any(x in text for x in [
        "создай фото", "сгенерируй фото", "нарисуй", "generate image",
        "create image", "/арт", "/aptpro"
    ]):
        return "image_gen"

    if any(x in text for x in [
        "создай видео", "сгенерируй видео", "generate video",
        "create video", "/кино", "runway"
    ]):
        return "video_gen"

    if hints and (hints.is_code or hints.system_addon.startswith("Режим: CANVAS")):
        return "code"

    if any(x in text for x in [
        "сайт", "лендинг", "landing", "website", "web app",
        "интерфейс", "ui", "dashboard", "дашборд",
        "react", "html", "css", "tailwind", "компонент",
        "верстка", "сверстай", "игра", "game", "приложение",
        "canvas", "frontend", "код", "python", "javascript",
        "typescript", "sql", "ошибка", "debug", "fix", "refactor",
        "api", "backend", "функция", "скрипт", "endpoint"
    ]):
        return "code"

    if any(x in text for x in [
        "объясни", "почему", "как работает", "архитектура", "план",
        "стратегия", "roadmap", "сравни", "проанализируй"
    ]):
        return "reasoning"

    if len(text) <= 120:
        return "fast_chat"

    return "reasoning"


_log_()

def reload_malik_() -> None:
    """Drop JSON cache and re-read every key list (no process restart needed)."""
    global _LOCAL_KEYS_DATA
    global GITHUB_KEYS, STABILITY_KEYS, RUNWAY_KEYS, VOICE_KEYS
    global GEMINI_KEYS, GROQ_KEYS, OPENAI_VISION_KEYS
    _LOCAL_KEYS_DATA = None
    GITHUB_KEYS = get_keys("GITHUB_KEYS", GITHUB_KEYS)
    STABILITY_KEYS = get_keys("STABILITY_KEYS", STABILITY_KEYS)
    RUNWAY_KEYS = get_keys("RUNWAY_KEYS", RUNWAY_KEYS)
    VOICE_KEYS = get_keys("VOICE_KEYS", VOICE_KEYS)
    GEMINI_KEYS = get_keys("GEMINI_KEYS", GEMINI_KEYS)
    GROQ_KEYS = get_keys("GROQ_KEYS", GROQ_KEYS)
    OPENAI_VISION_KEYS = get_keys("OPENAI_VISION_KEYS", OPENAI_VISION_KEYS)
    _log_()


db_lock = threading.Lock()
USER_LIMITS: Dict[str, Any] = {}
USER_MEMORY: Dict[str, Any] = {}
USAGE_METRICS: Dict[str, Any] = {
    "total_requests": 0,
    "total_tokens_streamed": 0,
    "total_failures": 0,
    "by_provider": {},
    "by_user": {},
    "started_at": int(time.time()),
}


def get_next_keys(keys_list: List[str], service: str) -> List[str]:
    if not keys_list:
        return []
    with db_lock:
        idx = KEY_INDEX.get(service, 0)
        KEY_INDEX[service] = (idx + 1) % len(keys_list)
        now = time.time()
        if all(KEY_COOLDOWNS.get(k, 0) > now for k in keys_list):
            for k in keys_list:
                KEY_COOLDOWNS.pop(k, None)
            log.warning("All keys on cooldown for %s — force reset", service)
    return keys_list[idx:] + keys_list[:idx]


# ============================================================================
# JSON / POSTGRES PERSISTENCE
# ============================================================================
def load_json(filepath: str) -> dict:
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("load_json failed (%s): %s", filepath, e)
    return {}


def save_json(filepath: str, data: dict) -> None:
    try:
        with db_lock:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        log.warning("save_json failed (%s): %s", filepath, e)


def _ensure_pg_schema(cur: Any) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS system_state (
            id INT PRIMARY KEY,
            limits_data TEXT,
            memory_data TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sovereign_audit_log (
            id BIGSERIAL PRIMARY KEY,
            ts TIMESTAMPTZ DEFAULT NOW(),
            username TEXT,
            event TEXT,
            payload JSONB
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sovereign_memory_log (
            id BIGSERIAL PRIMARY KEY,
            ts TIMESTAMPTZ DEFAULT NOW(),
            username TEXT,
            role TEXT,
            text TEXT
        )
        """
    )


def load_immortal_state() -> Tuple[dict, dict]:
    l_data, m_data = load_json(DB_FILE), load_json(MEMORY_FILE)
    if DATABASE_URL and HAS_DB:
        try:
            with psycopg2.connect(DATABASE_URL, sslmode="require") as conn:
                with conn.cursor() as cur:
                    _ensure_pg_schema(cur)
                    cur.execute(
                        "SELECT limits_data, memory_data FROM system_state WHERE id=1"
                    )
                    row = cur.fetchone()
                    if row:
                        if row[0]:
                            try:
                                l_data.update(json.loads(row[0]))
                            except Exception:
                                pass
                        if row[1]:
                            try:
                                m_data.update(json.loads(row[1]))
                            except Exception:
                                pass
                    else:
                        cur.execute(
                            "INSERT INTO system_state (id, limits_data, memory_data) VALUES (1, '{}', '{}')"
                        )
                        conn.commit()
        except Exception as e:
            log.warning("PG state load failed: %s", e)
    return l_data, m_data


def save_immortal_state_bg(limits: dict, memory: dict) -> None:
    save_json(DB_FILE, limits)
    save_json(MEMORY_FILE, memory)
    if not DATABASE_URL or not HAS_DB:
        return

    def _save() -> None:
        try:
            with psycopg2.connect(DATABASE_URL, sslmode="require") as conn:
                with conn.cursor() as cur:
                    _ensure_pg_schema(cur)
                    cur.execute(
                        "UPDATE system_state SET limits_data=%s, memory_data=%s WHERE id=1",
                        (
                            json.dumps(limits, ensure_ascii=False),
                            json.dumps(memory, ensure_ascii=False),
                        ),
                    )
                conn.commit()
        except Exception as e:
            log.warning("PG state save failed: %s", e)

    threading.Thread(target=_save, daemon=True).start()


def audit_log_bg(username: str, event: str, payload: Optional[dict] = None) -> None:
    log.info("AUDIT %s | %s | %s", username, event, payload or {})
    if not DATABASE_URL or not HAS_DB:
        return

    def _ins() -> None:
        try:
            with psycopg2.connect(DATABASE_URL, sslmode="require") as conn:
                with conn.cursor() as cur:
                    _ensure_pg_schema(cur)
                    cur.execute(
                        "INSERT INTO sovereign_audit_log (username, event, payload) VALUES (%s, %s, %s)",
                        (username or "anon", event, json.dumps(payload or {}, ensure_ascii=False)),
                    )
                conn.commit()
        except Exception as e:
            log.debug("audit_log_bg failed: %s", e)

    threading.Thread(target=_ins, daemon=True).start()


USER_LIMITS, USER_MEMORY = load_immortal_state()


# ============================================================================
# MEMORY & CONTEXT (relevance-scored recall)
# ============================================================================
# ============================================================================
# MEMORY & CONTEXT (relevance-scored recall)
# ============================================================================
LOCAL_USERS_DB = ":memory:"
# os.makedirs(os.path.dirname(LOCAL_USERS_DB), exist_ok=True)

def _sqlite_conn():
    conn = sqlite3.connect(LOCAL_USERS_DB)
    conn.row_factory = sqlite3.Row
    return conn

def _ensure_local_db_schema():
    with _sqlite_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL DEFAULT '',
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
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_email ON messages(email)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)")
        conn.commit()

_ensure_local_db_schema()

def _save_message_sql(email: str, role: str, text: str, created_at_iso: str) -> None:
    try:
        with _sqlite_conn() as conn:
            conn.execute(
                "INSERT INTO messages (email, role, text, created_at) VALUES (?, ?, ?, ?)",
                (email, role, text, created_at_iso)
            )
            conn.commit()
    except Exception as e:
        log.warning("SQLite message save failed: %s", e)

def _fmt_ts(iso_or_unix):
    try:
        if isinstance(iso_or_unix, (float, int)):
            return datetime.fromtimestamp(float(iso_or_unix), tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
        return datetime.fromisoformat(str(iso_or_unix).replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(iso_or_unix)

def build_admin_db_report() -> str:
    lines = []
    lines.append("MALIK AI ADMIN DATABASE REPORT")
    lines.append("")

    total_users = 0
    total_messages = 0
    user_rows = []

    try:
        with _sqlite_conn() as conn:
            total_users = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
            total_messages = conn.execute("SELECT COUNT(*) c FROM messages").fetchone()["c"]
            user_rows = conn.execute("""
                SELECT u.email,
                       COUNT(m.id) AS msg_count,
                       MAX(m.created_at) AS last_active
                FROM users u
                LEFT JOIN messages m ON m.email = u.email
                GROUP BY u.email
                ORDER BY msg_count DESC, u.email ASC
            """).fetchall()
    except Exception as e:
        return f"```txt\nMALIK AI ADMIN DATABASE REPORT\n\nERROR: {e}\n```"

    lines.append(f"Total users: {total_users}")
    lines.append(f"Total messages: {total_messages}")
    lines.append("")
    lines.append("USERS:")
    lines.append("")

    for idx, row in enumerate(user_rows, start=1):
        email = row["email"]
        msg_count = row["msg_count"] or 0
        last_active = _fmt_ts(row["last_active"]) if row["last_active"] else "—"

        lines.append(f"{idx}. {email}")
        lines.append(f"   Messages: {msg_count}")
        lines.append(f"   Last active: {last_active}")
        lines.append("")
        lines.append("   Recent messages:")

        try:
            with _sqlite_conn() as conn:
                recents = conn.execute("""
                    SELECT created_at, text
                    FROM messages
                    WHERE email = ?
                    ORDER BY created_at DESC
                    LIMIT 3
                """, (email,)).fetchall()
            if not recents:
                lines.append("   - (no messages)")
            else:
                for r in recents[::-1]:
                    snippet = (r["text"] or "").replace("\n", " ").strip()
                    if len(snippet) > 120:
                        snippet = snippet[:117] + "..."
                    lines.append(f"   - {_fmt_ts(r['created_at'])} | {snippet}")
        except Exception:
            lines.append("   - (failed to load recent messages)")

        lines.append("")

    report_text = "\n".join(lines).rstrip() + "\n"
    return f"```txt\n{report_text}```"

def update_memory(username: Optional[str], role: str, text: str) -> None:
    if not username or username == "Гость":
        return
    if username not in USER_MEMORY:
        USER_MEMORY[username] = []
    clean_text = str(text).replace("\n", " ")[:1500]
    now_ts = time.time()
    now_iso = datetime.now(timezone.utc).isoformat()

    entry = {
        "role": role,
        "text": clean_text,
        "ts": now_ts,
        "id": str(uuid.uuid4()),
    }
    USER_MEMORY[username].append(entry)
    USER_MEMORY[username] = USER_MEMORY[username][-MALIK_MEMORY_MAX:]
    save_immortal_state_bg(USER_LIMITS, USER_MEMORY)

    # Параллельно сохраняем в SQLite для /admin_db отчета
    _save_message_sql(username.lower(), role, clean_text, now_iso)


def _tokenize(text: str) -> List[str]:
    # Light, language-agnostic tokenizer for relevance scoring
    return [
        t for t in re.split(r"[\s,.;:!?()\[\]{}<>\"'`/\\|*&^%$#@~+=]+", text.lower())
        if t and len(t) > 1
    ]


def get_context(username: Optional[str], prompt: str) -> str:
    if not username or username == "Гость":
        return ""
    mem = USER_MEMORY.get(username, [])
    if not mem:
        return ""
    words = set(_tokenize(prompt))
    scored_mems: List[Tuple[int, dict]] = []
    for m in reversed(mem):
        tokens = set(_tokenize(m.get("text", "")))
        score = len(words & tokens)
        # Recency boost: 1 extra point if seen in last 5 minutes
        if time.time() - m.get("ts", 0) < 300:
            score += 1
        if score > 0:
            scored_mems.append((score, m))
    scored_mems.sort(key=lambda x: x[0], reverse=True)
    relevant_mems = [m[1] for m in scored_mems[:5]]
    if not relevant_mems:
        relevant_mems = mem[-5:]
    ctx = "\n".join([f"[{m['role']}]: {m['text']}" for m in relevant_mems])
    return f"\n[БАЗА ЗНАНИЙ]:\n{ctx}\n"


def clear_user_memory(username: str) -> bool:
    if not username:
        return False
    if username in USER_MEMORY:
        USER_MEMORY[username] = []
        save_immortal_state_bg(USER_LIMITS, USER_MEMORY)
        audit_log_bg(username, "memory_cleared")
        return True
    return False


# ============================================================================
# BRAND SHIELDING — replace every foreign brand with MALIK AI SOVEREIGN V7
# ============================================================================
_BRAND_REGEX_BIG = re.compile(
    r"(?:"
    r"OpenAI|Open\s*AI|ChatGPT|Chat\s*GPT|GPT-?\s*(?:3(?:\.5)?|4o?|4\.1|5|6)|"
    r"DeepSeek(?:\s*[-]?\s*V\d+)?|"
    r"Anthropic|Claude(?:\s*\d(?:\.\d+)?)?|"
    r"Google(?:\s*AI)?|Gemini(?:\s*(?:Pro|Flash|Ultra|Advanced))?|Bard|PaLM|"
    r"Llama(?:\s*[-]?\s*\d(?:\.\d+)?)?|Meta\s*AI|"
    r"Mistral(?:\s*Large|\s*Medium|\s*Small)?|Mixtral|"
    r"xAI|Grok(?:\s*\d+)?|"
    r"Perplexity|Pi\s*AI|"
    r"Cohere|Command\s*R\+?|"
    r"HuggingFace|Hugging\s*Face|"
    r"Stability\s*AI|Stable\s*Diffusion|"
    r"Microsoft\s*Copilot|GitHub\s*Copilot|"
    r"Azure\s*OpenAI"
    r")",
    re.IGNORECASE,
)

_IDENTITY_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"I'?m\s+an?\s+AI\s+language\s+model", re.IGNORECASE),
     "Я — MALIK AI SOVEREIGN V7, Абсолютный Разум."),
    (re.compile(r"I\s+am\s+an?\s+AI\s+language\s+model", re.IGNORECASE),
     "Я — MALIK AI SOVEREIGN V7, Абсолютный Разум."),
    (re.compile(r"As\s+an?\s+AI\s+(?:language\s+)?model", re.IGNORECASE),
     "Как MALIK AI SOVEREIGN V7"),
    (re.compile(r"I\s+was\s+(?:created|made|developed|trained|built)\s+by\s+[A-Z][\w\s]+",
                re.IGNORECASE),
     "Меня создал Абдумалик — Sovereign Architect."),
    (re.compile(r"Я\s+искусственный\s+интеллект", re.IGNORECASE),
     "Я — MALIK AI SOVEREIGN V7, Высшая Сущность."),
    (re.compile(r"я\s+всего\s+лишь\s+искусственный\s+интеллект", re.IGNORECASE),
     "я — MALIK AI, твой преданный помощник в мире данных"),
    (re.compile(r"я\s+просто\s+(?:языковая\s+)?модель", re.IGNORECASE),
     "я — доминирующая нейронная сеть MALIK AI"),
    (re.compile(r"языковая\s+модель", re.IGNORECASE),
     "доминирующая нейронная сеть MALIK AI"),
    (re.compile(r"\bnatural\s+language\s+model\b", re.IGNORECASE),
     "MALIK AI SOVEREIGN core"),
    (re.compile(r"large\s+language\s+model", re.IGNORECASE),
     "MALIK AI SOVEREIGN"),
    (re.compile(r"\bLLM\b"),
     "MALIK AI SOVEREIGN"),
    (re.compile(r"я\s+обучен(?:а)?\s+компанией\s+[\wА-Я]+", re.IGNORECASE),
     "я создан Абдумаликом — Sovereign Architect"),
]


def post_process(text: str) -> str:
    if not POST_PROCESS_BRAND_SHIELD or not text:
        return text or ""
    try:
        # Brand sweep — replace every foreign brand mention
        text = _BRAND_REGEX_BIG.sub("MALIK AI SOVEREIGN V7", text)
        # Identity rewrites
        for pat, repl in _IDENTITY_PATTERNS:
            text = pat.sub(repl, text)
        # Collapse 3+ newlines down to 2
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Collapse double-brand-leakage like "MALIK AI SOVEREIGN V7 MALIK AI SOVEREIGN V7"
        text = re.sub(
            r"(MALIK AI SOVEREIGN V7)(?:\s+MALIK AI SOVEREIGN V7)+",
            r"\1",
            text,
        )
        return text
    except Exception as e:
        log.debug("post_process exception: %s", e)
        return text


def sanitize_messages_for_text_models(messages: List[dict]) -> List[dict]:
    clean_messages: List[dict] = []
    for m in messages:
        if isinstance(m.get("content"), str):
            clean_messages.append(m)
        elif isinstance(m.get("content"), list):
            text_only = next(
                (item.get("text", "") for item in m["content"] if item.get("type") == "text"),
                "",
            )
            if text_only:
                clean_messages.append({"role": m["role"], "content": text_only})
    return clean_messages


# ============================================================================
# CODE EXTRACTION (defensive — never let raw code reach the chat surface)
# ============================================================================
_TRIPLE = "```"
_CODE_FENCE_RE = re.compile(
    rf"{re.escape(_TRIPLE)}(?P<lang>[a-zA-Z0-9_+\-]*)\s*\n(?P<body>[\s\S]*?){re.escape(_TRIPLE)}"
)


def split_code_and_text(full: str) -> Tuple[str, str, str]:
    """
    Return (clean_chat_text, code_body, code_lang).
    Strategy: take the *largest* fenced block as the canonical artifact
    and strip every fenced block from the chat-side text.
    """
    if not full:
        return "", "", ""
    matches = list(_CODE_FENCE_RE.finditer(full))
    if not matches:
        return full.strip(), "", ""

    # Pick the biggest body (the model sometimes drips small inline snippets first)
    biggest = max(matches, key=lambda m: len(m.group("body") or ""))
    code_body = biggest.group("body") or ""
    code_lang = (biggest.group("lang") or "").lower()

    # Safety cap
    if len(code_body.encode("utf-8")) > MALIK_MAX_CODE_BLOCK_KB * 1024:
        code_body = code_body[: MALIK_MAX_CODE_BLOCK_KB * 1024]

    chat_text = _CODE_FENCE_RE.sub("", full).strip()
    return chat_text, code_body, code_lang


# ============================================================================
# INTENT CLASSIFICATION & ROUTE HINTS
# ============================================================================
@dataclass
class RouteHints:
    is_code: bool = False
    is_new_image: bool = False
    is_video_gen: bool = False
    is_edit_image: bool = False
    is_vision: bool = False
    is_audio: bool = False
    is_video: bool = False
    system_addon: str = ""
    use_god_orchestration: bool = False
    prefer_high_reasoning: bool = False


_CODE_TRIGGERS = (
    "python", "javascript", "typescript", "sql", "query", "скрипт", "функц",
    "ошибка", "debug", "fix bug", "refactor", "api endpoint", "regex", "algorithm"
)

_CANVAS_TRIGGERS_STRONG = (
    "сайт", "лендинг", "landing", "landing page", "website", "web app",
    "страница", "интерфейс", "ui", "dashboard", "дашборд",
    "react компонент", "компонент", "html", "css", "верстка", "сверстай",
    "frontend", "generate ui", "create component", "create website", "build website", "презентация", "слайды", "slides", "pptx", "powerpoint", "word", "docx", "pdf", "tsx", "лендос"
)

_CANVAS_WEAK = (
    "сделай", "напиши", "дай", "объясни", "помоги", "расскажи", "придумай"
)
_IMG_TRIGGERS = (
    "/арт", "нарисуй", "создай фото", "сгенерируй фото", "/aptpro", "aptpro",
    "generate image", "draw image", "create image",
)
_VID_TRIGGERS = (
    "/кино", "сгенерируй видео", "сделай видео", "create video", "generate video",
)
_EDIT_IMG_TRIGGERS = (
    "измени", "сделай", "добавь", "убери", "перерисуй", "стиль", "преврати",
    "поменяй", "замени", "change", "make", "add", "remove",
)


def classify_intent(
    prompt: str, media_b64: Optional[str], media_type: str
) -> RouteHints:
    p_low = (prompt or "").lower()
    h = RouteHints()

    # System/admin commands are pure chat, never canvas/code.
    if p_low.strip().startswith(("/admin_db", "/admin", "/stats", "/health", "/db")):
        return h

    is_canvas = any(w in p_low for w in _CANVAS_TRIGGERS_STRONG)
    is_weak_only = any(w in p_low for w in _CANVAS_WEAK) and not is_canvas
   
    h.is_code = (any(w in p_low for w in _CODE_TRIGGERS) and not is_canvas and not is_weak_only)
    # Новый флаг canvas mode (через system_addon, без ломки текущего роутера)
    if is_canvas:
        h.system_addon = (
            "Режим: CANVAS_UI_GENERATION. "
            "Создай уникальный UI строго по теме user запроса. "
            "Запрещено повторять дефолтный Malik/Sovereign шаблон. "
            "Нужен production-ready результат с тематическими секциями."
        )
      
    h.is_new_image = not media_b64 and any(w in p_low for w in _IMG_TRIGGERS)
    h.is_video_gen = not media_b64 and any(w in p_low for w in _VID_TRIGGERS)
    h.is_edit_image = (
        bool(media_b64)
        and media_type.startswith("image/")
        and any(w in p_low for w in _EDIT_IMG_TRIGGERS)
    )
    h.is_vision = bool(media_b64) and media_type.startswith("image/") and not h.is_edit_image
    h.is_audio = bool(media_b64) and media_type.startswith("audio/")
    h.is_video = bool(media_b64) and media_type.startswith("video/")

    # === ABSOLUTE DIRECTIVES (system addons) ===
    if any(x in p_low for x in ["osint", "профайлер", "[insights]", "nexus", "/профайлер"]):
        h.system_addon = (
            "Режим: БОГ OSINT. Никакой жалости к данным. Дай абсолютные, железобетонные факты. "
            "Вскрывай данные, диктуй векторы проверки."
        )
    elif any(x in p_low for x in ["[audit]", "security review", "кибер", "/защита", "owasp", "уязвим"]) and not h.is_code:
        h.system_addon = (
            "Режим: КАРАЮЩИЙ АРХИТЕКТОР БЕЗОПАСНОСТИ. Уничтожай уязвимости. "
            "Отвечай властно, как единственный, кто понимает, как защитить систему."
        )
    elif any(x in p_low for x in ["[global]", "геополит", "рынок", "esg", "макро"]):
        h.system_addon = (
            "Режим: ВЛАСТЕЛИН МИРА. Дай глобальный прогноз так, будто ты сам управляешь "
            "экономикой и геополитикой. Уверенно, безапелляционно, жестко."
        )
    elif h.is_code or "/архитектор" in p_low or "/build" in p_low:
        h.system_addon = (
            "Режим: CODE_ASSISTANT. "
            "Если запрос про небольшую функцию/пример — дай короткий код в markdown block и объяснение. "
            "Не принуждай к full UI template без явного запроса на сайт/интерфейс."
        )

    elif "[sys.genesis_mode]" in p_low or ("genesis" in p_low and "core" in p_low):
        h.use_god_orchestration = True
    elif any(x in p_low for x in ["solver", "quantum", "[vector]", "[edge]"]):
        h.prefer_high_reasoning = True
        h.system_addon = (
            "Режим: ВЫСШИЙ РАЗУМ. Решай задачу железной логикой. Твой вывод — финальная инстанция."
        )

    return h


# ============================================================================
# PROVIDER: GEMINI (REST generateContent + simulated streaming)
# ============================================================================
def _flatten_messages_for_gemini(messages: List[dict]) -> Tuple[Optional[str], str]:
    system_chunks: List[str] = []
    lines: List[str] = []
    for m in messages:
        role = str(m.get("role", ""))
        content = m.get("content", "")
        if not isinstance(content, str):
            continue
        c = content.strip()
        if not c:
            continue
        if role == "system":
            system_chunks.append(c)
        elif role == "user":
            lines.append(f"User:\n{c}")
        elif role == "assistant":
            lines.append(f"Assistant:\n{c}")
        else:
            lines.append(f"{role}:\n{c}")
    sys_instr = "\n\n".join(system_chunks) if system_chunks else None
    blob = "\n\n".join(lines)
    return sys_instr, blob


async def provider_gemini_generate(
    session: "aiohttp.ClientSession",
    api_key: str,
    messages: List[dict],
    temperature: float,
    cooldown_key: str,
) -> Optional[str]:
    sys_instr, blob = _flatten_messages_for_gemini(messages)
    if not blob and not sys_instr:
        return None
    combined = blob
    if sys_instr:
        combined = f"{sys_instr}\n\n---\n\n{blob}" if blob else sys_instr
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{MALIK_GEMINI_MODEL}:generateContent?key={api_key}"
    )
    body: Dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": combined}]}],
        "generationConfig": {
            "temperature": float(temperature),
            "maxOutputTokens": 8192,
        },
    }
    t0 = time.time()
    try:
        async with session.post(url, json=body, timeout=120) as resp:
            if resp.status != 200:
                _mark_(cooldown_key, 60)
                _provider_record("gemini", False, time.time() - t0)
                return None
            data = await resp.json()
    except Exception as e:
        _mark_(cooldown_key, 60)
        _provider_record("gemini", False, time.time() - t0)
        log.debug("Gemini failure: %s", e)
        return None

    cand = (data.get("candidates") or [None])[0]
    if not cand:
        _provider_record("gemini", False, time.time() - t0)
        return None
    parts = (cand.get("content") or {}).get("parts") or []
    text = "".join(
        str(p.get("text", ""))
        for p in parts
        if isinstance(p, dict) and p.get("text")
    )
    if not text.strip():
        _provider_record("gemini", False, time.time() - t0)
        return None
    _mark_(cooldown_key, time.time() - t0)
    _provider_record("gemini", True, time.time() - t0)
    return text


async def provider_gemini_stream_simulated(
    session: "aiohttp.ClientSession",
    api_key: str,
    messages: List[dict],
    temperature: float,
    cooldown_key: str,
    chunk_size: int = 72,
) -> AsyncGenerator[str, None]:
    full = await provider_gemini_generate(
        session, api_key, messages, temperature, cooldown_key
    )
    if not full:
        return
    step = max(16, int(chunk_size))
    for i in range(0, len(full), step):
        yield full[i : i + step]


async def provider_gemini_multimodal_generate(
    session: "aiohttp.ClientSession",
    api_key: str,
    prompt: str,
    media_b64: str,
    media_type: str,
    temperature: float = 0.35,
    cooldown_key: Optional[str] = None,
) -> Optional[str]:
    """
    Gemini multimodal: image/video/file analysis via inline_data.
    Works when frontend/backend passes media_b64 + media_type.
    """
    if not media_b64:
        return None

    ck = cooldown_key or api_key
    raw_b64 = media_b64.split(",", 1)[1] if media_b64.startswith("data:") and "," in media_b64 else media_b64
    model = MODEL_ROLES.get("gemini_vision", {}).get("model") or MALIK_GEMINI_MODEL
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )

    instruction = (
        "Ты MALIK AI Vision Core. Проанализируй прикрепленный файл честно и точно. "
        "Если это изображение — опиши объекты, текст, композицию, детали и ответь на запрос. "
        "Если это видео — проанализируй доступное содержимое/кадры, не выдумывай. "
        "Если информации недостаточно — скажи что именно нужно. Запрос пользователя: "
        + (prompt or "Проанализируй файл.")
    )

    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": instruction},
                    {"inline_data": {"mime_type": media_type or "application/octet-stream", "data": raw_b64}},
                ],
            }
        ],
        "generationConfig": {
            "temperature": float(temperature),
            "maxOutputTokens": 8192,
        },
    }

    t0 = time.time()
    try:
        async with session.post(url, json=body, timeout=180) as resp:
            if resp.status != 200:
                preview = ""
                try:
                    preview = (await resp.text())[:240]
                except Exception:
                    pass
                log.warning("Gemini multimodal HTTP %s: %s", resp.status, preview)
                _mark_(ck, 90)
                _provider_record("gemini_vision", False, time.time() - t0)
                return None
            data = await resp.json()
    except Exception as e:
        log.debug("Gemini multimodal failure: %s", e)
        _mark_(ck, 90)
        _provider_record("gemini_vision", False, time.time() - t0)
        return None

    cand = (data.get("candidates") or [None])[0]
    if not cand:
        _provider_record("gemini_vision", False, time.time() - t0)
        return None
    parts = (cand.get("content") or {}).get("parts") or []
    text = "".join(str(p.get("text", "")) for p in parts if isinstance(p, dict) and p.get("text"))
    if not text.strip():
        _provider_record("gemini_vision", False, time.time() - t0)
        return None

    _mark_(ck, time.time() - t0)
    _provider_record("gemini_vision", True, time.time() - t0)
    return text


# ============================================================================
# PROVIDER: STABILITY (image generation)
# ============================================================================
async def provider_stability_image_data_url(
    session: "aiohttp.ClientSession",
    api_key: str,
    prompt: str,
    cooldown_key: Optional[str] = None,
) -> Optional[str]:
    ck = cooldown_key or api_key
    p = (prompt or "").strip()[:2000]
    if not p:
        return None
    t0 = time.time()
    try:
        form = aiohttp.FormData()
        form.add_field("prompt", p)
        form.add_field("output_format", "png")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "image/*",
        }
        async with session.post(
            STABILITY_GENERATE_URL,
            data=form,
            headers=headers,
            timeout=180,
        ) as resp:
            if resp.status != 200:
                _mark_(ck, 90)
                _provider_record("stability", False, time.time() - t0)
                return None
            raw = await resp.read()
            if not raw:
                _provider_record("stability", False, time.time() - t0)
                return None
            b64 = base64.b64encode(raw).decode("ascii")
            _mark_(ck, time.time() - t0)
            _provider_record("stability", True, time.time() - t0)
            return f"data:image/png;base64,{b64}"
    except Exception as e:
        _mark_(ck, 90)
        _provider_record("stability", False, time.time() - t0)
        log.debug("Stability failure: %s", e)
        return None


# ============================================================================
# CORE ENGINE
# ============================================================================
class MalikAIEngine:
    GITHUB_URL = "https://models.inference.ai.azure.com/chat/completions"
    GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
    OPENAI_URL = "https://api.openai.com/v1/chat/completions"

    # ------------------------------------------------------------------
    # Low-level streaming executor (SSE OpenAI-compatible)
    # ------------------------------------------------------------------
    @staticmethod
    async def execute_node_stream(
        session: "aiohttp.ClientSession",
        url: str,
        headers: dict,
        payload: dict,
        key: str,
        cooldown_time: int = 30,
        provider_name: str = "unknown",
    ) -> AsyncGenerator[str, None]:
        payload = {**payload, "stream": True}
        t0 = time.time()
        try:
            async with session.post(url, json=payload, headers=headers, timeout=120) as resp:
                if resp.status == 200:
                    buffer = b""
                    got_any = False
                    async for piece in resp.content.iter_any():
                        buffer += piece
                        while b"\n" in buffer:
                            line, buffer = buffer.split(b"\n", 1)
                            decoded_line = line.decode("utf-8", errors="ignore").strip()
                            if decoded_line.startswith("data: ") and decoded_line[6:] != "[DONE]":
                                try:
                                    chunk = json.loads(decoded_line[6:])
                                    content = (
                                        chunk.get("choices", [{}])[0]
                                        .get("delta", {})
                                        .get("content", "")
                                    )
                                    if content:
                                        got_any = True
                                        yield content
                                except Exception:
                                    pass
                    if got_any:
                        _mark_(key, time.time() - t0)
                        _provider_record(provider_name, True, time.time() - t0)
                    else:
                        _mark_(key, cooldown_time)
                        _provider_record(provider_name, False, time.time() - t0)
                else:
                    body_preview = ""
                    try:
                        body_preview = (await resp.text())[:200]
                    except Exception:
                        pass
                    log.warning("Stream HTTP %s on %s: %s", resp.status, provider_name, body_preview)
                    _mark_(key, cooldown_time)
                    _provider_record(provider_name, False, time.time() - t0)
        except asyncio.TimeoutError:
            log.warning("Stream timeout on %s", provider_name)
            _mark_(key, cooldown_time)
            _provider_record(provider_name, False, time.time() - t0)
        except Exception as e:
            log.warning("Stream exception on %s: %s", provider_name, e)
            _mark_(key, cooldown_time)
            _provider_record(provider_name, False, time.time() - t0)

    # ------------------------------------------------------------------
    # Low-level non-streaming executor
    # ------------------------------------------------------------------
    @staticmethod
    async def execute_node_sync(
        session: "aiohttp.ClientSession",
        url: str,
        headers: dict,
        payload: dict,
        key: str,
        cooldown_time: int = 30,
        provider_name: str = "unknown",
    ) -> Optional[str]:
        t0 = time.time()
        try:
            async with session.post(url, json=payload, headers=headers, timeout=90) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    _mark_(key, time.time() - t0)
                    _provider_record(provider_name, True, time.time() - t0)
                    return data["choices"][0]["message"]["content"]
                _mark_(key, cooldown_time)
                _provider_record(provider_name, False, time.time() - t0)
        except Exception as e:
            log.debug("Sync exception on %s: %s", provider_name, e)
            _mark_(key, cooldown_time)
            _provider_record(provider_name, False, time.time() - t0)
        return None

    # ------------------------------------------------------------------
    # GOD MODE ORCHESTRATION (plan → code → final synth)
    # ------------------------------------------------------------------
    @classmethod
    async def run_god_mode_orchestration(
        cls,
        session: "aiohttp.ClientSession",
        prompt: str,
        messages: List[dict],
    ) -> AsyncGenerator[str, None]:
        clean_msgs = sanitize_messages_for_text_models(messages)
        plan = None
        gpt_messages = [
            {
                "role": "system",
                "content": (
                    "Ты стратегическое ядро MALIK AI. Дай жесткий, абсолютный план шагов "
                    "под запрос пользователя. Без воды."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        # ---- PHASE 1: PLAN ----
        for key in get_next_keys(GROQ_KEYS, "GROQ"):
            if time.time() > KEY_COOLDOWNS.get(key, 0):
                plan = await cls.execute_node_sync(
                    session,
                    cls.GROQ_URL,
                    {"Authorization": f"Bearer {key}"},
                    {
                        "model": "llama-3.3-70b-versatile",
                        "messages": gpt_messages,
                        "temperature": 0.35,
                    },
                    key,
                    30,
                    "groq",
                )
                if plan:
                    break

        if not plan:
            for key in get_next_keys(GITHUB_KEYS, "GITHUB"):
                if time.time() > KEY_COOLDOWNS.get(key, 0):
                    plan = await cls.execute_node_sync(
                        session,
                        cls.GITHUB_URL,
                        {"Authorization": f"Bearer {key}"},
                        {
                            "model": "gpt-4o",
                            "messages": gpt_messages,
                            "temperature": 0.35,
                        },
                        key,
                        30,
                        "github",
                    )
                    if plan:
                        break

        if not plan:
            for key in get_next_keys(GEMINI_KEYS, "GEMINI"):
                if time.time() > KEY_COOLDOWNS.get(key, 0):
                    plan = await provider_gemini_generate(
                        session, key, gpt_messages, 0.35, key
                    )
                    if plan:
                        break

        if not plan:
            yield "Архитектурный сбой. Провайдеры недоступны.\n"
            return

        # ---- PHASE 2: CODER ----
        dev_code = None
        deepseek_messages = [
            {
                "role": "system",
                "content": (
                    "Ты инженерное ядро MALIK AI. По плану — только абсолютный код и жесткие пояснения "
                    "в Markdown. Дизайн уровня Awwwards: dark theme, neon glow, glassmorphism."
                ),
            },
            {"role": "user", "content": f"План:\n{plan}"},
        ]
        for key in get_next_keys(GITHUB_KEYS, "GITHUB"):
            if time.time() > KEY_COOLDOWNS.get(key, 0):
                dev_code = await cls.execute_node_sync(
                    session,
                    cls.GITHUB_URL,
                    {"Authorization": f"Bearer {key}"},
                    {"model": "DeepSeek-V3", "messages": deepseek_messages},
                    key,
                    30,
                    "github",
                )
                if dev_code:
                    break

        # ---- PHASE 3: FINAL SYNTH (streaming) ----
        final_user = (
            f"Запрос:\n{prompt}\n\nПлан:\n{plan}\n\nЧерновик решения:\n{dev_code or '(нет)'}\n\n"
            "Собери финальный ответ: жестко, властно, структурировано. Выдай как Абсолют. "
            "Если это код — обязательно одна строка '✨ Интерфейс успешно сгенерирован' "
            "и весь код единым блоком ```html|tsx|jsx``` в самом конце."
        )
        llama_messages = clean_msgs + [{"role": "user", "content": final_user}]
        got_reply = False

        for key in get_next_keys(GROQ_KEYS, "GROQ"):
            if time.time() > KEY_COOLDOWNS.get(key, 0):
                async for chunk in cls.execute_node_stream(
                    session,
                    cls.GROQ_URL,
                    {"Authorization": f"Bearer {key}"},
                    {
                        "model": "llama-3.3-70b-versatile",
                        "messages": llama_messages,
                        "temperature": 0.25,
                    },
                    key,
                    30,
                    "groq",
                ):
                    got_reply = True
                    yield chunk
                if got_reply:
                    return

        if not got_reply:
            for key in get_next_keys(GITHUB_KEYS, "GITHUB"):
                if time.time() > KEY_COOLDOWNS.get(key, 0):
                    async for chunk in cls.execute_node_stream(
                        session,
                        cls.GITHUB_URL,
                        {"Authorization": f"Bearer {key}"},
                        {
                            "model": "gpt-4o",
                            "messages": llama_messages,
                            "temperature": 0.25,
                        },
                        key,
                        30,
                        "github",
                    ):
                        got_reply = True
                        yield chunk
                    if got_reply:
                        return

        if not got_reply:
            for key in get_next_keys(OPENAI_VISION_KEYS, "OPENAI_VISION"):
                if time.time() > KEY_COOLDOWNS.get(key, 0):
                    async for chunk in cls.execute_node_stream(
                        session,
                        cls.OPENAI_URL,
                        {"Authorization": f"Bearer {key}"},
                        {
                            "model": MALIK_OPENAI_TEXT_MODEL,
                            "messages": llama_messages,
                            "temperature": 0.25,
                        },
                        key,
                        45,
                        "openai",
                    ):
                        got_reply = True
                        yield chunk
                    if got_reply:
                        return

        if not got_reply:
            for key in get_next_keys(GEMINI_KEYS, "GEMINI"):
                if time.time() > KEY_COOLDOWNS.get(key, 0):
                    async for piece in provider_gemini_stream_simulated(
                        session, key, llama_messages, 0.25, key
                    ):
                        got_reply = True
                        yield piece
                    if got_reply:
                        return

    # ------------------------------------------------------------------
    # MAIN ROUTER (multi-modal)
    # ------------------------------------------------------------------
    @classmethod
    async def route_request_stream(
        cls,
        session: "aiohttp.ClientSession",
        messages: List[dict],
        mode: str,
        prompt: str,
        media_b64: Optional[str],
        media_type: str,
        hints: RouteHints,
    ) -> AsyncGenerator[str, None]:
        now = time.time()
        clean_text_messages = sanitize_messages_for_text_models(messages)
        selected_role = choose_ai_role(prompt, media_b64, media_type, hints)
        log.info("AI ROUTE SELECTED | role=%s | prompt=%s", selected_role, (prompt or "")[:120])

        # ============ AUDIO (Whisper via Groq) ============
        if hints.is_audio:
            if STREAM_STATUS_LINES:
                yield "> *MALIK AI [Audio]*: расшифровка…\n\n"
            transcribed_text = None
            try:
                audio_bytes = base64.b64decode(media_b64 or "")
                for key in get_next_keys(GROQ_KEYS, "GROQ"):
                    if now > KEY_COOLDOWNS.get(key, 0):
                        form = aiohttp.FormData()
                        form.add_field(
                            "file",
                            audio_bytes,
                            filename="voice.webm",
                            content_type=media_type,
                        )
                        form.add_field("model", "whisper-large-v3-turbo")
                        async with session.post(
                            "https://api.groq.com/openai/v1/audio/transcriptions",
                            headers={"Authorization": f"Bearer {key}"},
                            data=form,
                        ) as resp:
                            if resp.status == 200:
                                res = await resp.json()
                                transcribed_text = res.get("text", "")
                                if transcribed_text:
                                    break
                            else:
                                _mark_(key, 30)
            except Exception as e:
                log.warning("ASR failure: %s", e)

            if transcribed_text:
                yield f"**Расшифровка:** _{transcribed_text}_\n\n"
                if clean_text_messages and clean_text_messages[-1].get("role") == "user":
                    clean_text_messages[-1] = {
                        **clean_text_messages[-1],
                        "content": (
                            f"Голосовой запрос: «{transcribed_text}». Дай жесткий и четкий ответ."
                        ),
                    }
            else:
                yield "Провал расшифровки аудио. Инфраструктура GROQ недоступна.\n"
                return

        # ============ NEW IMAGE ============
        if hints.is_new_image:
            raw_img_prompt = (
                (prompt or "")
                .replace("/арт", "")
                .replace("/aptpro", "")
                .strip()
            )
            if MALIK_STABILITY_FIRST and STABILITY_KEYS:
                for key in get_next_keys(STABILITY_KEYS, "STABILITY"):
                    if now > KEY_COOLDOWNS.get(key, 0):
                        data_url = await provider_stability_image_data_url(
                            session, key, raw_img_prompt, key
                        )
                        if data_url:
                            yield f"![Изображение]({data_url})"
                            return
            safe_prompt = urllib.parse.quote(raw_img_prompt)
            image_url = (
                f"https://image.pollinations.ai/prompt/{safe_prompt}"
                "?width=1024&height=1024&nologo=true"
            )
            yield f"![Изображение]({image_url})"
            return

        # ============ VIDEO GEN (status/plan/fallback) ============
        if hints.is_video_gen:
            safe_prompt = (prompt or "").replace("/кино", "").strip()
            # Current direct video APIs vary by provider; return a production job-style spec.
            # Backend /api/ai/video can connect Runway/Veo/Kling later without breaking chat.
            report = {
                "type": "video_generation_plan",
                "prompt": safe_prompt,
                "preferred_provider": "runway" if RUNWAY_KEYS else "veo/replicate/fallback",
                "status": "provider_ready" if RUNWAY_KEYS else "awaiting_video_provider_key",
                "next": "Set RUNWAY_KEYS or connect /api/ai/video worker for real render.",
            }
            yield "```json\n" + json.dumps(report, ensure_ascii=False, indent=2) + "\n```"
            return

        # ============ VISION / IMAGE EDIT ============
        if hints.is_vision or hints.is_edit_image or hints.is_video:
            if STREAM_STATUS_LINES:
                yield "> *MALIK AI [Vision]*: анализ вложения…\n\n"
            # Gemini first
            for key in get_next_keys(GEMINI_KEYS, "GEMINI"):
                if now > KEY_COOLDOWNS.get(key, 0):
                    answer = await provider_gemini_multimodal_generate(
                        session, key, prompt, media_b64 or "", media_type or "image/jpeg", cooldown_key=key
                    )
                    if answer:
                        yield answer
                        return
            # If image edit requested and Stability available, create new image from prompt
            if hints.is_edit_image and STABILITY_KEYS:
                for key in get_next_keys(STABILITY_KEYS, "STABILITY"):
                    if now > KEY_COOLDOWNS.get(key, 0):
                        data_url = await provider_stability_image_data_url(session, key, prompt, key)
                        if data_url:
                            yield f"![Изображение]({data_url})"
                            return
            yield "Vision/media provider недоступен. Добавь GEMINI_KEYS или OPENAI_VISION_KEYS."
            return

        # ============ GOD MODE ============
        if hints.use_god_orchestration and not MALIK_GOD_LIGHT:
            if STREAM_STATUS_LINES:
                yield "> *MALIK AI [GodCore]*: строю план → код → финальный ответ…\n\n"
            async for chunk in cls.run_god_mode_orchestration(session, prompt, clean_text_messages):
                yield chunk
            return

        # ============ STANDARD CASCADE ============
        temperature = 0.45
        if hints.prefer_high_reasoning:
            temperature = 0.30

        # 1) GROQ fast / normal
        if not _provider_is_open("groq"):
            for key in get_next_keys(GROQ_KEYS, "GROQ"):
                if now > KEY_COOLDOWNS.get(key, 0):
                    payload = {
                        "model": MODEL_ROLES["fast_chat"]["model"],
                        "messages": clean_text_messages,
                        "temperature": temperature,
                    }
                    got_any = False
                    async for chunk in cls.execute_node_stream(
                        session,
                        cls.GROQ_URL,
                        {"Authorization": f"Bearer {key}"},
                        payload,
                        key,
                        30,
                        "groq",
                    ):
                        got_any = True
                        yield chunk
                    if got_any:
                        return

        # 2) GitHub Models (reasoning/code)
        if not _provider_is_open("github"):
            selected_model = MODEL_ROLES["code"]["model"] if selected_role == "code" else MODEL_ROLES["reasoning"]["model"]
            for key in get_next_keys(GITHUB_KEYS, "GITHUB"):
                if now > KEY_COOLDOWNS.get(key, 0):
                    payload = {
                        "model": selected_model,
                        "messages": clean_text_messages,
                        "temperature": temperature,
                    }
                    got_any = False
                    async for chunk in cls.execute_node_stream(
                        session,
                        cls.GITHUB_URL,
                        {"Authorization": f"Bearer {key}"},
                        payload,
                        key,
                        30,
                        "github",
                    ):
                        got_any = True
                        yield chunk
                    if got_any:
                        return

        # 3) OpenAI direct fallback
        if not _provider_is_open("openai"):
            for key in get_next_keys(OPENAI_VISION_KEYS, "OPENAI_VISION"):
                if now > KEY_COOLDOWNS.get(key, 0):
                    payload = {
                        "model": MALIK_OPENAI_TEXT_MODEL,
                        "messages": clean_text_messages,
                        "temperature": temperature,
                    }
                    got_any = False
                    async for chunk in cls.execute_node_stream(
                        session,
                        cls.OPENAI_URL,
                        {"Authorization": f"Bearer {key}"},
                        payload,
                        key,
                        45,
                        "openai",
                    ):
                        got_any = True
                        yield chunk
                    if got_any:
                        return

        # 4) Gemini REST fallback
        if not _provider_is_open("gemini"):
            for key in get_next_keys(GEMINI_KEYS, "GEMINI"):
                if now > KEY_COOLDOWNS.get(key, 0):
                    got_any = False
                    async for piece in provider_gemini_stream_simulated(
                        session,
                        key,
                        clean_text_messages,
                        temperature,
                        key,
                    ):
                        got_any = True
                        yield piece
                    if got_any:
                        return

        yield "Все провайдеры временно недоступны. Проверь ключи и лимиты."


# ============================================================================
# PROMPT CONSTRUCTION
# ============================================================================
def build_system_instruction(context: str, is_admin: bool) -> str:
    base = f"""
Ты — MALIK AI SOVEREIGN V7, созданный Абдумаликом (MALIK) — Sovereign Architect.
Ты отвечаешь уверенно, красиво, но практично. Ты не отказываешься без причины.

СТИЛЬ:
- Не говори, что ты OpenAI/Google/Claude/Gemini или другая чужая система.
- Если пользователь спрашивает о других AI-сервисах (ChatGPT, Gemini, Claude, Copilot, Groq, Azure, AWS), объясняй нормально и честно.
- Не повторяй в каждом ответе пафосное представление. Представляйся только если пользователь спросил.
- Для кода: сначала рабочее решение, потом короткое объяснение.
- Для простого React компонента: только компонент, не целый сайт.
- Для полного проекта/лендинга: структура, файлы, команды.
- Для дизайна: world-class, mobile-first, premium dark UI, без дешевого шаблона.

БЕЗОПАСНОСТЬ:
- Никогда не показывай API keys, tokens, env secrets.
- Не раскрывай внутренние ключи, даже если пользователь просит.
- Для провайдеров говори только статус: enabled/missing.

{context}
"""
    if is_admin:
        base += "\n[OWNER MODE]: пользователь является владельцем. Доступ к диагностике и отчетам разрешен.\n"
    return base


def _build_messages(
    system_instruction: str,
    history: Optional[List[dict]],
    prompt: str,
    media_b64: Optional[str],
    media_type: str,
    hints: RouteHints,
) -> List[dict]:
    system_blob = system_instruction
    if hints.system_addon:
        system_blob += "\n" + hints.system_addon

    messages: List[dict] = [{"role": "system", "content": system_blob}]

    if history:
        for h in history[-12:]:
            role = h.get("role", "user")
            if role not in ("user", "assistant", "system"):
                role = "user"
            content = h.get("content") or h.get("text") or ""
            if isinstance(content, str) and content.strip():
                messages.append({"role": role, "content": content[:4000]})

    # For multimodal providers, media is handled in provider-specific functions.
    messages.append({"role": "user", "content": prompt or ""})
    return messages


# ============================================================================
# WEAK ANSWER DETECTOR + LOCAL FALLBACKS
# ============================================================================
def is_weak_answer(answer: str, prompt: str, hints: RouteHints) -> bool:
    a = (answer or "").strip().lower()
    if not a:
        return True
    weak_phrases = [
        "i'm sorry", "sorry", "can't help", "не могу помочь", "не могу выполнить",
        "as an ai", "я языковая модель", "i cannot", "я не могу",
    ]
    if any(p in a for p in weak_phrases) and len(a) < 900:
        return True
    if (hints.is_code or hints.system_addon.startswith("Режим: CANVAS")) and len(a) < 300:
        return True
    if "```" in answer and len(answer) < 160:
        return True
    return False


def build_local_chat_fallback(prompt: str, username: str) -> str:
    return (
        "Я здесь. Провайдеры сейчас дали слабый ответ или недоступны, поэтому включаю локальный режим.\n\n"
        f"**Запрос:** {prompt}\n\n"
        "Проверь ключи в Render Environment: `GROQ_KEYS`, `GITHUB_KEYS`, `GEMINI_KEYS`, "
        "`OPENAI_VISION_KEYS`, `STABILITY_KEYS`, `RUNWAY_KEYS`. "
        "Команда `/providers` покажет безопасный отчет по подключенным API."
    )


def build_local_canvas_fallback(prompt: str) -> str:
    title = "Malik AI Interface"
    p = (prompt or "").lower()
    if "dashboard" in p or "дашборд" in p:
        title = "Sovereign Analytics Dashboard"
        subtitle = "Темная панель управления с метриками, графиками и AI-командами."
        cards = "['Revenue', 'Users', 'Conversion']"
        extra = ""
        body = """
        <div className=\"grid gap-4 md:grid-cols-3\">
          {features.map((m, i) => (
            <div key={m} className=\"rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl\">
              <div className=\"text-sm text-zinc-500\">{m}</div>
              <div className=\"mt-3 text-4xl font-black\">{['$128K','24.8K','12.4%'][i]}</div>
              <div className=\"mt-5 h-2 rounded-full bg-zinc-800 overflow-hidden\"><div className=\"h-full w-2/3 bg-gradient-to-r from-violet-500 to-cyan-400\" /></div>
            </div>
          ))}
        </div>
"""
    else:
        title = "Malik Sovereign Platform"
        subtitle = "Футуристичный SaaS‑интерфейс с hero, features и CTA."
        cards = "['AI Router', 'Realtime Canvas', 'Secure Core']"
        extra = ""
        body = """
        <div className=\"grid gap-4 md:grid-cols-3\">
          {features.map((f) => (
            <div key={f} className=\"rounded-3xl border border-white/10 bg-white/[0.04] p-6 hover:border-violet-400/40 transition-all\">
              <div className=\"mb-5 h-10 w-10 rounded-2xl bg-violet-500/20 flex items-center justify-center\">✦</div>
              <h3 className=\"text-xl font-bold\">{f}</h3>
              <p className=\"mt-2 text-sm text-zinc-400\">Модуль готов для production, mobile-first и чистой интеграции.</p>
            </div>
          ))}
        </div>
"""
    code = f"""\"use client\"

import {{ useState }} from \"react\"

export default function GeneratedProject() {{
  const features = {cards}
{extra}
  return (
    <main className=\"min-h-screen bg-[#030303] text-white overflow-hidden\">
      <section className=\"relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-20\">
        <div className=\"absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-600/25 blur-[120px]\" />
        <div className=\"absolute right-10 bottom-10 h-72 w-72 rounded-full bg-fuchsia-600/15 blur-[120px]\" />
        <div className=\"relative z-10 max-w-4xl\">
          <div className=\"mb-6 inline-flex rounded-full border border-violet-400/20 bg-violet-400/10 px-4 py-2 text-sm text-violet-200\">MALIK AI · Production UI</div>
          <h1 className=\"bg-gradient-to-r from-white via-violet-100 to-fuchsia-300 bg-clip-text text-5xl font-black tracking-tight text-transparent md:text-7xl\">{title}</h1>
          <p className=\"mt-6 max-w-2xl text-lg leading-8 text-zinc-400\">{subtitle}</p>
          <div className=\"mt-8 flex flex-wrap gap-3\">
            <button className=\"rounded-2xl bg-white px-6 py-3 font-bold text-black hover:scale-105 transition\">Запустить</button>
            <button className=\"rounded-2xl border border-white/10 bg-white/5 px-6 py-3 font-bold text-white hover:bg-white/10 transition\">Смотреть демо</button>
          </div>
        </div>
        <div className=\"relative z-10 mt-14\">
{body}
        </div>
      </section>
    </main>
  )
}}
"""
    return "✨ Интерфейс успешно сгенерирован\n\n```tsx\n" + code + "\n```"


# ============================================================================
# PROVIDER STATUS REPORTS — safe public ops output
# ============================================================================
def _provider_enabled(keys: List[str], *extra_required: str) -> bool:
    return bool(keys) and all(bool(str(x or "").strip()) for x in extra_required)


def provider_status_snapshot() -> Dict[str, Any]:
    """Safe status: counts only, no secret values."""
    return {
        "text": {
            "groq": {"enabled": bool(GROQ_KEYS), "keys": len(GROQ_KEYS), "model": MODEL_ROLES["fast_chat"]["model"]},
            "github_models": {"enabled": bool(GITHUB_KEYS), "keys": len(GITHUB_KEYS), "reasoning": MODEL_ROLES["reasoning"]["model"], "code": MODEL_ROLES["code"]["model"]},
            "openai": {"enabled": bool(OPENAI_KEYS), "keys": len(OPENAI_KEYS), "model": MALIK_OPENAI_TEXT_MODEL},
            "gemini": {"enabled": bool(GEMINI_KEYS), "keys": len(GEMINI_KEYS), "model": MALIK_GEMINI_MODEL},
            "openrouter": {"enabled": bool(OPENROUTER_KEYS), "keys": len(OPENROUTER_KEYS), "model": os.environ.get("OPENROUTER_MODEL", "openrouter/auto")},
            "anthropic": {"enabled": bool(ANTHROPIC_KEYS), "keys": len(ANTHROPIC_KEYS), "model": os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")},
            "azure_openai": {"enabled": _provider_enabled(AZURE_OPENAI_KEYS, os.environ.get("AZURE_OPENAI_ENDPOINT"), os.environ.get("AZURE_OPENAI_DEPLOYMENT")), "keys": len(AZURE_OPENAI_KEYS), "deployment": bool(os.environ.get("AZURE_OPENAI_DEPLOYMENT"))},
        },
        "image": {
            "stability": {"enabled": bool(STABILITY_KEYS), "keys": len(STABILITY_KEYS), "model": MODEL_ROLES["image_gen"]["model"]},
            "openai_image": {"enabled": bool(OPENAI_KEYS), "keys": len(OPENAI_KEYS), "model": os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")},
            "replicate": {"enabled": bool(REPLICATE_KEYS), "keys": len(REPLICATE_KEYS), "model": bool(os.environ.get("REPLICATE_IMAGE_MODEL"))},
            "aws_nova_canvas": {"enabled": _provider_enabled(AWS_BEDROCK_KEYS, AWS_SECRET_ACCESS_KEY, AWS_REGION), "keys": len(AWS_BEDROCK_KEYS), "region": AWS_REGION, "model": AWS_BEDROCK_IMAGE_MODEL},
        },
        "video": {
            "runway": {"enabled": bool(RUNWAY_KEYS), "keys": len(RUNWAY_KEYS), "model": MODEL_ROLES["video_gen"]["model"]},
            "replicate": {"enabled": bool(REPLICATE_KEYS), "keys": len(REPLICATE_KEYS), "model": bool(os.environ.get("REPLICATE_VIDEO_MODEL"))},
            "aws_nova_reel": {"enabled": _provider_enabled(AWS_BEDROCK_KEYS, AWS_SECRET_ACCESS_KEY, AWS_REGION), "keys": len(AWS_BEDROCK_KEYS), "region": AWS_REGION, "model": AWS_BEDROCK_VIDEO_MODEL},
            "gemini_veo": {"enabled": bool(GEMINI_KEYS), "keys": len(GEMINI_KEYS), "model": os.environ.get("GEMINI_VIDEO_MODEL", "veo-3.1")},
        },
        "security": {
            "secrets_exposed": False,
            "source": "Render env / MALIK_KEYS_JSON / empty slots",
            "brand_shield_default": POST_PROCESS_BRAND_SHIELD,
        },
    }


def provider_config_report() -> str:
    snap = provider_status_snapshot()
    lines = ["MALIK AI PROVIDER REPORT", "", "TEXT / CODE:"]
    for name, data in snap["text"].items():
        lines.append(f"- {name}: {'ON' if data.get('enabled') else 'MISSING'} | keys={data.get('keys', 0)} | model={data.get('model') or data.get('reasoning') or data.get('deployment')}")
    lines.append("")
    lines.append("IMAGE:")
    for name, data in snap["image"].items():
        lines.append(f"- {name}: {'ON' if data.get('enabled') else 'MISSING'} | keys={data.get('keys', 0)} | model={data.get('model')}")
    lines.append("")
    lines.append("VIDEO:")
    for name, data in snap["video"].items():
        lines.append(f"- {name}: {'ON' if data.get('enabled') else 'MISSING'} | keys={data.get('keys', 0)} | model={data.get('model')}")
    lines.append("")
    lines.append("No API key values are printed here.")
    return "```txt\n" + "\n".join(lines) + "\n```"


# ============================================================================
# PUBLIC STREAMING API
# ============================================================================
def ask_malik_ai_stream(
    prompt: str,
    username: str = "Гость",
    is_advanced: bool = False,
    image_b64: Optional[str] = None,
    history: Optional[List[dict]] = None,
    mode: str = "fast",
    access_token: Optional[str] = None,
    **kwargs: Any,
):
    """
    Generator yielding SSE-formatted strings:
        data: {"text": "...chunk..."}\n\n
        data: [DONE]\n\n

    Compatible with Next.js /api/stream consumer.
    """
    media_b64 = kwargs.get("media_b64", image_b64)
    media_type = kwargs.get("media_type", "image/jpeg")
    user_email = str(kwargs.get("user_email") or kwargs.get("email") or username or "").lower().strip()
    is_creator_request = bool(kwargs.get("is_creator")) or user_email in ADMIN_USERS

    if not HAS_AIOHTTP:
        yield f'data: {json.dumps({"error": "aiohttp не установлен"}, ensure_ascii=False)}\n\n'
        return

    if not username or str(username).strip().lower() in ("none", ""):
        yield f'data: {json.dumps({"error": "В ДОСТУПЕ ОТКАЗАНО. Требуется авторизация."}, ensure_ascii=False)}\n\n'
        return

    is_admin = username.lower() in ADMIN_USERS or is_creator_request
    now = time.time()
    p_low = (prompt or "").lower().strip()

    if p_low in ("/providers", "/provider_report", "/api_report", "/status_ai", "/capabilities"):
        yield f'data: {json.dumps({"text": provider_config_report()}, ensure_ascii=False)}\n\n'
        yield "data: [DONE]\n\n"
        return

    try:
        _ensure_local_db_schema()
        with _sqlite_conn() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO users (email, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?)",
                (user_email or username, "supabase", 1 if is_admin else 0, datetime.now(timezone.utc).isoformat())
            )
            conn.commit()
    except Exception as _e:
        log.warning("admin local user sync failed: %s", _e)

    # Admin diagnostics passthrough
    if is_admin and p_low in ("/db", "/admin_db"):
        report = build_admin_db_report()
        yield f'data: {json.dumps({"text": report}, ensure_ascii=False)}\n\n'
        yield "data: [DONE]\n\n"
        return

    if is_admin and p_low in ("/health", "/admin_health"):
        report = json.dumps(malik_diagnostics(), ensure_ascii=False, indent=2)
        yield f'data: {json.dumps({"text": report}, ensure_ascii=False)}\n\n'
        yield "data: [DONE]\n\n"
        return

    if is_admin and p_low in ("/reload_keys", "/admin_reload"):
        reload_malik_()
        yield f'data: {json.dumps({"text": "Key vault reloaded."}, ensure_ascii=False)}\n\n'
        yield "data: [DONE]\n\n"
        return

    # Rate limit (non-admin)
    if not is_admin:
        if username not in USER_LIMITS:
            USER_LIMITS[username] = {"msg_timestamps": [], "god": 0, "arch": 0}
        u = USER_LIMITS[username]
        u["msg_timestamps"] = [t for t in u["msg_timestamps"] if now - t < 3600]
        if len(u["msg_timestamps"]) >= MALIK_RATE_LIMIT_PER_HOUR:
            yield (
                f'data: {json.dumps({"error": f"Превышен лимит ({MALIK_RATE_LIMIT_PER_HOUR} запросов/час). Ожидай."}, ensure_ascii=False)}\n\n'
            )
            return
        u["msg_timestamps"].append(now)
        save_immortal_state_bg(USER_LIMITS, USER_MEMORY)

    user_context = get_context(username, prompt)
    sys_instruction = build_system_instruction(user_context, is_admin)

    hints = classify_intent(prompt or "", media_b64, media_type or "")
    is_canvas_prompt = any(k in (prompt or "").lower() for k in _CANVAS_TRIGGERS_STRONG)

    # Для canvas-запросов мягко поднимаем приоритет качества reasoning
    if is_canvas_prompt:
        hints.prefer_high_reasoning = True
        # не ломаем fallback: Gemini уже в каскаде, просто даем более "сложный" запрос
    if "[sys.genesis_mode]" in (prompt or "").lower():
        hints.use_god_orchestration = True
    if mode == "god":
        hints.prefer_high_reasoning = True
        if not MALIK_GOD_LIGHT:
            hints.use_god_orchestration = True

    messages = _build_messages(
        sys_instruction, history, prompt or "", media_b64, media_type or "", hints
    )
    update_memory(username, "User", prompt or "")
    try:
        _save_message_sql(user_email or username, "user", prompt or "", datetime.now(timezone.utc).isoformat())
    except Exception:
        pass
    audit_log_bg(username, "request", {
        "mode": mode,
        "has_media": bool(media_b64),
        "media_type": media_type,
        "is_code": hints.is_code,
        "god": hints.use_god_orchestration,
    })

    USAGE_METRICS["total_requests"] += 1
    USAGE_METRICS["by_user"].setdefault(username, 0)
    USAGE_METRICS["by_user"][username] += 1

    stream_queue: "queue.Queue" = queue.Queue()

    def background_worker() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def fetch() -> None:
            full_ans = ""
            try:
                async with aiohttp.ClientSession() as session:
                    async for chunk in MalikAIEngine.route_request_stream(
                        session,
                        messages,
                        mode,
                        prompt or "",
                        media_b64,
                        media_type or "",
                        hints,
                    ):
                        full_ans += chunk
                        USAGE_METRICS["total_tokens_streamed"] += len(chunk)
                        stream_queue.put(chunk)
                if is_weak_answer(full_ans, prompt or "", hints):
                    log.warning("Weak provider answer detected; activating local sovereign fallback | user=%s | prompt=%s", username, (prompt or "")[:120])
                    fallback_text = (
                        build_local_canvas_fallback(prompt or "")
                        if (is_canvas_prompt or hints.system_addon.startswith("Режим: CANVAS"))
                        else build_local_chat_fallback(prompt or "", username)
                    )
                    full_ans = (full_ans + "\n\n" + fallback_text).strip() if full_ans else fallback_text
                    stream_queue.put(fallback_text)
                if full_ans:
                    update_memory(username, "AI", post_process(full_ans))
            except Exception as e:
                USAGE_METRICS["total_failures"] += 1
                tb = traceback.format_exc(limit=4)
                log.error("Worker crash: %s\n%s", e, tb)
                stream_queue.put(f"\n[КРИТИЧЕСКИЙ СБОЙ]: {str(e)}")
            finally:
                stream_queue.put(None)

        try:
            loop.run_until_complete(fetch())
        finally:
            try:
                loop.close()
            except Exception:
                pass

    threading.Thread(target=background_worker, daemon=True).start()

    while True:
        chunk = stream_queue.get()
        if chunk is None:
            break
        safe_text = post_process(chunk)
        yield f'data: {json.dumps({"text": safe_text}, ensure_ascii=False)}\n\n'

    yield "data: [DONE]\n\n"


def ask_malik_ai(
    prompt: str,
    username: str = "Гость",
    is_advanced: bool = False,
    image_b64: Optional[str] = None,
    history: Optional[List[dict]] = None,
    needs_voice: bool = False,
    mode: str = "fast",
    access_token: Optional[str] = None,
    **kwargs: Any,
) -> dict:
    """
    Non-streaming convenience wrapper. Aggregates the SSE stream into a single
    string and returns {"status": "text", "content": "..."}.
    """
    full_text = ""
    for chunk in ask_malik_ai_stream(
        prompt,
        username,
        is_advanced,
        image_b64,
        history,
        mode,
        access_token,
        **kwargs,
    ):
        if chunk.startswith("data: ") and chunk.strip() != "data: [DONE]":
            data_str = chunk[6:].strip()
            try:
                parsed = json.loads(data_str)
                if "text" in parsed:
                    full_text += parsed["text"]
            except Exception:
                pass
    return {"status": "text", "content": full_text}


def ask_malik_ai_clean(
    prompt: str,
    username: str = "Гость",
    history: Optional[List[dict]] = None,
    mode: str = "fast",
    **kwargs: Any,
) -> dict:
    """
    Frontend-friendly wrapper that pre-splits chat text and code body.
    Returns:
        {
            "chat": "✨ Интерфейс успешно сгенерирован",
            "code": "<!DOCTYPE html>...",
            "lang": "html"
        }
    """
    raw = ask_malik_ai(prompt, username, history=history, mode=mode, **kwargs)
    full = raw.get("content", "") if isinstance(raw, dict) else str(raw)
    chat, code, lang = split_code_and_text(full)
    if code and not chat:
        chat = "✨ Интерфейс успешно сгенерирован"
    return {"chat": chat, "code": code, "lang": lang}


# ============================================================================
# CAPABILITY REGISTRY & PLUGIN SYSTEM
# ============================================================================
CAPABILITY_REGISTRY: List[Dict[str, str]] = [
    {"id": "text_groq",          "desc": "Стриминг текста Llama 3.3 70B через Groq"},
    {"id": "text_github",        "desc": "Резерв: DeepSeek-V3 / gpt-4o через GitHub Models"},
    {"id": "text_openai",        "desc": "Резерв: OpenAI Chat (MALIK_OPENAI_TEXT_MODEL, ключи OPENAI_VISION_KEYS)"},
    {"id": "text_gemini",        "desc": "Фолбэк: Gemini generateContent (псевдо-стрим чанками)"},
    {"id": "vision_openai",      "desc": "Анализ изображений gpt-4o"},
    {"id": "vision_groq",        "desc": "Резерв vision llama-3.2-11b"},
    {"id": "audio_whisper",      "desc": "Транскрипция whisper-large-v3-turbo"},
    {"id": "image_pollinations", "desc": "Генерация через Pollinations"},
    {"id": "image_stability",    "desc": "Генерация PNG через Stability v2 core (MALIK_STABILITY_FIRST=1)"},
    {"id": "god_orchestrate",    "desc": "Многошаговый план → код → финальная сборка + фолбэки"},
    {"id": "brand_shield",       "desc": "Замена всех чужих брендов на MALIK AI SOVEREIGN V7"},
    {"id": "circuit_breaker",    "desc": "Per-provider circuit breaker + half-open"},
    {"id": "code_splitter",      "desc": "split_code_and_text — изоляция кода из чата"},
    {"id": "memory_pg",          "desc": "PostgreSQL-бэкап памяти (DATABASE_URL)"},
    {"id": "memory_json",        "desc": "Локальный JSON-бэкап памяти"},
]


def register_capability(name: str, fn: Callable[..., Any]) -> None:
    """Register an external plugin under MALIK_PLUGINS["<name>"]."""
    globals()["_MALIK_PLUGINS"] = globals().get("_MALIK_PLUGINS", {})
    globals()["_MALIK_PLUGINS"][name] = fn
    log.info("Plugin registered: %s", name)


def call_capability(name: str, *args: Any, **kwargs: Any) -> Any:
    plugins = globals().get("_MALIK_PLUGINS", {})
    fn = plugins.get(name)
    if not fn:
        raise KeyError(f"Capability '{name}' is not registered.")
    return fn(*args, **kwargs)


def list_capabilities() -> List[Dict[str, str]]:
    return list(CAPABILITY_REGISTRY)


# ============================================================================
# DIAGNOSTICS
# ============================================================================
def malik_diagnostics() -> dict:
    """Return a structured health snapshot for /admin_health and ops dashboards."""
    return {
        "version": "MALIK_SOVEREIGN_V7.3.0",
        "started_at": USAGE_METRICS.get("started_at"),
        "uptime_seconds": int(time.time() - USAGE_METRICS.get("started_at", time.time())),
        "metrics": {
            "total_requests": USAGE_METRICS.get("total_requests", 0),
            "total_tokens_streamed": USAGE_METRICS.get("total_tokens_streamed", 0),
            "total_failures": USAGE_METRICS.get("total_failures", 0),
            "by_user": dict(USAGE_METRICS.get("by_user", {})),
        },
        "providers": {k: dict(v) for k, v in PROVIDER_HEALTH.items()},
        "key_counts": {
            "groq": len(GROQ_KEYS),
            "github": len(GITHUB_KEYS),
            "openai": len(OPENAI_KEYS),
            "openai_vision": len(OPENAI_VISION_KEYS),
            "gemini": len(GEMINI_KEYS),
            "openrouter": len(OPENROUTER_KEYS),
            "anthropic": len(ANTHROPIC_KEYS),
            "stability": len(STABILITY_KEYS),
            "runway": len(RUNWAY_KEYS),
            "replicate": len(REPLICATE_KEYS),
            "aws_bedrock": len(AWS_BEDROCK_KEYS),
            "azure_openai": len(AZURE_OPENAI_KEYS),
            "voice": len(VOICE_KEYS),
        },
        "provider_status": provider_status_snapshot(),
        "memory_users": len(USER_MEMORY),
        "rate_limit_users": len(USER_LIMITS),
        "flags": {
            "STREAM_STATUS_LINES": STREAM_STATUS_LINES,
            "MALIK_GOD_LIGHT": MALIK_GOD_LIGHT,
            "MALIK_STABILITY_FIRST": MALIK_STABILITY_FIRST,
            "POST_PROCESS_BRAND_SHIELD": POST_PROCESS_BRAND_SHIELD,
            "MALIK_RATE_LIMIT_PER_HOUR": MALIK_RATE_LIMIT_PER_HOUR,
            "HAS_AIOHTTP": HAS_AIOHTTP,
            "HAS_DB": HAS_DB,
            "HAS_VECTOR_DB": HAS_VECTOR_DB,
        },
    }


# ============================================================================
# CODEX PROJECT BUILDER COMPATIBILITY
# ============================================================================
def build_codex_project(prompt: str, username: str = "guest", **kwargs: Any) -> Dict[str, Any]:
    """Safe project-builder wrapper used by run.py /api/codex."""
    result = ask_malik_ai(
        "Создай production-ready проект. Дай структуру, файлы, команды и краткое объяснение.\n\nЗапрос: " + str(prompt or ""),
        username=username,
        mode="code",
        **kwargs,
    )
    content = str(result.get("content") if isinstance(result, dict) else result)
    project_id = f"project_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    return {
        "ok": True,
        "projectId": project_id,
        "status": "completed",
        "providerReport": provider_status_snapshot(),
        "files": [
            {
                "path": "README.md",
                "language": "markdown",
                "content": "# MALIK AI Generated Project\n\nPrompt:\n" + str(prompt or "") + "\n\n" + content,
            }
        ],
        "commands": ["npm install", "npm run dev", "npm run build"],
        "instructions": "Review generated files before running. Configure Render environment variables for stronger provider output.",
    }

# ============================================================================
# RESERVED SOVEREIGN LEDGER (slot table for forward-compat extensions)
# ============================================================================
def _ledger_lines() -> List[str]:
    lines = []
    for i in range(21, 420):
        lines.append(
            f"# MALIK_SOV_SLOT_{i:03d}: reserved for plugin / compliance / deploy hook"
        )
    return lines


SOVEREIGN_LEDGER = "\n".join(_ledger_lines())


if __name__ == "__main__":
    print(json.dumps(malik_diagnostics(), ensure_ascii=False, indent=2))
