from __future__ import annotations

import base64
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except Exception:  # pragma: no cover - Render installs requests, but import stays safe.
    requests = None  # type: ignore


MEDIA_USAGE_COUNTS: Dict[str, int] = {}
MEDIA_USAGE_LOCK = threading.Lock()
MEDIA_USAGE_STORE_PATH = Path(os.environ.get("MEDIA_USAGE_STORE_PATH", "app/static/storage/media_usage.json"))


def _safe_int_env(name: str, fallback: int, minimum: int = 1, maximum: int = 1_000_000) -> int:
    try:
        value = int(os.environ.get(name, str(fallback)) or fallback)
    except Exception:
        return fallback
    return max(minimum, min(maximum, value))


def _today_key() -> str:
    try:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return str(int(time.time() // 86400))


def _load_usage_store() -> Dict[str, Any]:
    try:
        if MEDIA_USAGE_STORE_PATH.exists():
            data = json.loads(MEDIA_USAGE_STORE_PATH.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}
    return {}


def _save_usage_store(data: Dict[str, Any]) -> None:
    try:
        MEDIA_USAGE_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        MEDIA_USAGE_STORE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        # Usage storage must never break generation.
        pass


def _usage_key(client_id: str) -> str:
    return f"{_today_key()}::{normalize_client_id(client_id)}"


def _free_media_limit() -> int:
    return _safe_int_env("MEDIA_FREE_DAILY_LIMIT", 1, minimum=0, maximum=1000)


def _max_prompt_chars() -> int:
    return _safe_int_env("MEDIA_MAX_PROMPT_CHARS", 2400, minimum=120, maximum=12000)




@dataclass(frozen=True)
class MediaProvider:
    id: str
    title: str
    kind: str
    api_key_env: str
    url_env: Optional[str] = None
    token_env: Optional[str] = None
    mode: str = "generic"
    docs_url: str = ""
    key_url: str = ""
    key_alias_envs: Tuple[str, ...] = ()
    default_url: str = ""
    model_env: str = ""
    default_model: str = ""
    tier: str = "standard"

    def api_key(self) -> str:
        for env_name in self.key_envs():
            value = os.environ.get(env_name, "").strip()
            if value:
                return value
        return ""

    def key_envs(self) -> Tuple[str, ...]:
        names = [self.api_key_env]
        if self.token_env:
            names.append(self.token_env)
        names.extend(self.key_alias_envs)
        deduped = []
        for name in names:
            if name and name not in deduped:
                deduped.append(name)
        return tuple(deduped)

    def url(self) -> str:
        if self.mode == "openai-image":
            return os.environ.get("OPENAI_IMAGE_URL", "https://api.openai.com/v1/images/generations").strip()
        return os.environ.get(self.url_env or "", "").strip() or self.default_url

    def key_configured(self) -> bool:
        return bool(self.api_key())

    def url_configured(self) -> bool:
        if self.mode == "openai-image":
            return True
        return bool(self.url())

    def configured(self) -> bool:
        if self.mode == "openai-image":
            return self.key_configured()
        return bool(self.key_configured() and self.url_configured())

    def required_env_names(self) -> List[str]:
        names = [self.api_key_env]
        if self.mode != "openai-image" and self.url_env and not self.default_url:
            names.append(self.url_env)
        return names

    def model(self) -> str:
        return os.environ.get(self.model_env, "").strip() or self.default_model


PHOTO_PROVIDERS: List[MediaProvider] = [
    MediaProvider(
        "luma-image",
        "Luma Photon",
        "photo",
        "LUMA_API_KEY",
        "LUMA_IMAGE_URL",
        mode="luma-image",
        docs_url="https://docs.lumalabs.ai/docs/image-generation",
        key_url="https://lumalabs.ai/dream-machine/api/keys",
        key_alias_envs=("LUMAAI_API_KEY",),
        default_url="https://api.lumalabs.ai/dream-machine/v1/generations/image",
        model_env="LUMA_IMAGE_MODEL",
        default_model="photon-1",
        tier="standard",
    ),
    MediaProvider(
        "openai-image",
        "OpenAI Image",
        "photo",
        "OPENAI_API_KEY",
        mode="openai-image",
        docs_url="https://platform.openai.com/docs/api-reference/images",
        key_url="https://platform.openai.com/api-keys",
    ),
    MediaProvider(
        "stability-image",
        "Stability AI",
        "photo",
        "STABILITY_API_KEY",
        "STABILITY_IMAGE_URL",
        docs_url="https://platform.stability.ai/docs",
        key_url="https://platform.stability.ai/account/keys",
    ),
    MediaProvider(
        "replicate-image",
        "Replicate Image",
        "photo",
        "REPLICATE_API_TOKEN",
        "REPLICATE_IMAGE_URL",
        docs_url="https://replicate.com/docs",
        key_url="https://replicate.com/account/api-tokens",
    ),
    MediaProvider(
        "fal-image",
        "fal.ai Image",
        "photo",
        "FAL_KEY",
        "FAL_IMAGE_URL",
        docs_url="https://fal.ai/docs",
        key_url="https://fal.ai/dashboard/keys",
    ),
    MediaProvider(
        "leonardo-image",
        "Leonardo AI",
        "photo",
        "LEONARDO_API_KEY",
        "LEONARDO_IMAGE_URL",
        docs_url="https://docs.leonardo.ai/docs/getting-started",
        key_url="https://app.leonardo.ai/api-access",
    ),
]

VIDEO_PROVIDERS: List[MediaProvider] = [
    MediaProvider(
        "google-veo",
        "Google Veo 3.1",
        "video",
        "GOOGLE_VEO_API_KEY",
        "GOOGLE_VEO_VIDEO_URL",
        mode="google-veo",
        docs_url="https://ai.google.dev/gemini-api/docs/video",
        key_url="https://aistudio.google.com/app/apikey",
        key_alias_envs=("GEMINI_API_KEY",),
        default_url="https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning",
        model_env="GOOGLE_VEO_MODEL",
        default_model="veo-3.1-generate-preview",
        tier="pro",
    ),
    MediaProvider(
        "runway-video",
        "Runway Gen-4.5",
        "video",
        "RUNWAYML_API_SECRET",
        "RUNWAY_VIDEO_URL",
        mode="runway-video",
        docs_url="https://docs.dev.runwayml.com/",
        key_url="https://dev.runwayml.com/",
        key_alias_envs=("RUNWAY_API_KEY",),
        default_url="https://api.dev.runwayml.com/v1/text_to_video",
        model_env="RUNWAY_VIDEO_MODEL",
        default_model="gen4.5",
        tier="pro",
    ),
    MediaProvider(
        "fal-kling-pro-video",
        "fal.ai Kling O3 4K",
        "video",
        "FAL_KEY",
        "FAL_PRO_VIDEO_URL",
        mode="fal-video",
        docs_url="https://fal.ai/models/fal-ai/kling-video/o3/4k/text-to-video/api",
        key_url="https://fal.ai/dashboard/keys",
        default_url="https://fal.run/fal-ai/kling-video/o3/4k/text-to-video",
        default_model="fal-ai/kling-video/o3/4k/text-to-video",
        tier="pro",
    ),
    MediaProvider(
        "luma-video",
        "Luma Ray 2",
        "video",
        "LUMA_API_KEY",
        "LUMA_VIDEO_URL",
        mode="luma-video",
        docs_url="https://docs.lumalabs.ai/docs/video-generation",
        key_url="https://lumalabs.ai/dream-machine/api/keys",
        key_alias_envs=("LUMAAI_API_KEY",),
        default_url="https://api.lumalabs.ai/dream-machine/v1/generations",
        model_env="LUMA_VIDEO_MODEL",
        default_model="ray-2",
        tier="pro",
    ),
    MediaProvider(
        "fal-video",
        "fal.ai Wan Video",
        "video",
        "FAL_KEY",
        "FAL_VIDEO_URL",
        mode="fal-video",
        docs_url="https://fal.ai/docs",
        key_url="https://fal.ai/dashboard/keys",
        default_url="https://fal.run/fal-ai/wan/v2.7/text-to-video",
        default_model="fal-ai/wan/v2.7/text-to-video",
    ),
    MediaProvider(
        "pika-video",
        "Pika",
        "video",
        "PIKA_API_KEY",
        "PIKA_VIDEO_URL",
        docs_url="https://pika.art/api",
        key_url="https://pika.art/api",
    ),
    MediaProvider(
        "kling-video",
        "Kling",
        "video",
        "KLING_API_KEY",
        "KLING_VIDEO_URL",
        docs_url="https://klingapi.com/docs",
        key_url="https://klingapi.com/docs",
    ),
    MediaProvider(
        "replicate-video",
        "Replicate Video",
        "video",
        "REPLICATE_API_TOKEN",
        "REPLICATE_VIDEO_URL",
        docs_url="https://replicate.com/docs",
        key_url="https://replicate.com/account/api-tokens",
    ),
]

DEFAULT_VIDEO_PROVIDER_ORDER = [
    "luma-video",
    "fal-video",
    "runway-video",
    "fal-kling-pro-video",
    "google-veo",
    "pika-video",
    "kling-video",
    "replicate-video",
]

DEFAULT_PRO_VIDEO_PROVIDER_ORDER = [
    "luma-video",
    "google-veo",
    "runway-video",
    "fal-kling-pro-video",
    "fal-video",
    "pika-video",
    "kling-video",
    "replicate-video",
]


FORMAT_TO_OPENAI_SIZE = {
    "1:1": "1024x1024",
    "9:16": "1024x1536",
    "16:9": "1536x1024",
}

FORMAT_TO_STORAGE_SIZE = {
    "1:1": (1024, 1024),
    "9:16": (900, 1600),
    "16:9": (1600, 900),
}


def safe_generator_response(kind: str, prompt: str) -> Dict[str, Any]:
    return {
        "ok": True,
        "kind": kind,
        "prompt": prompt,
        "fallback": True,
        "status": "safe-local",
        "backendHook": f"/api/generate/{kind}",
    }


def public_provider_status(kind: str) -> List[Dict[str, Any]]:
    providers = PHOTO_PROVIDERS if kind == "photo" else VIDEO_PROVIDERS
    return [
        {
            "id": provider.id,
            "title": provider.title,
            "kind": provider.kind,
            "configured": provider.configured(),
            "keyConfigured": provider.key_configured(),
            "urlConfigured": provider.url_configured(),
            "keyEnv": provider.api_key_env,
            "keyAliasEnv": list(provider.key_envs()[1:]),
            "urlEnv": provider.url_env,
            "requiredEnv": provider.required_env_names(),
            "docsUrl": provider.docs_url,
            "keyUrl": provider.key_url,
            "mode": provider.mode,
            "tier": provider.tier,
            "model": provider.model(),
            "hasDefaultUrl": bool(provider.default_url),
        }
        for provider in providers
    ]


def is_media_pro(payload: Dict[str, Any]) -> bool:
    configured_code = os.environ.get("MEDIA_PRO_ACCESS_CODE", "").strip()
    submitted_code = str(
        payload.get("mediaProAccessCode")
        or payload.get("mediaProCode")
        or payload.get("proAccessCode")
        or payload.get("accessCode")
        or ""
    ).strip()
    if configured_code and submitted_code and submitted_code == configured_code:
        return True

    user = str(payload.get("userEmail") or payload.get("email") or payload.get("username") or "").strip().lower()
    admin_users = {
        item.strip().lower()
        for item in os.environ.get(
            "MALIK_ADMIN_USERS",
            "amangeldymalik38@gmail.com,anonnommalik79@gmail.com,admin@malik.ai",
        ).split(",")
        if item.strip()
    }
    return user in admin_users


def can_use_free_media(client_id: str) -> bool:
    limit = _free_media_limit()
    if limit <= 0:
        return False
    key = _usage_key(client_id)
    with MEDIA_USAGE_LOCK:
        store = _load_usage_store()
        count = int(store.get(key, MEDIA_USAGE_COUNTS.get(key, 0)) or 0)
        return count < limit


def mark_media_used(client_id: str) -> None:
    key = _usage_key(client_id)
    with MEDIA_USAGE_LOCK:
        store = _load_usage_store()
        count = int(store.get(key, MEDIA_USAGE_COUNTS.get(key, 0)) or 0) + 1
        store[key] = count
        MEDIA_USAGE_COUNTS[key] = count
        _save_usage_store(store)


def normalize_client_id(value: str) -> str:
    clean = str(value or "guest").strip().lower()
    return clean[:160] or "guest"


def parse_provider_order(env_name: str, fallback: List[str]) -> List[str]:
    raw = os.environ.get(env_name, "").strip()
    if not raw:
        return fallback
    order = [item.strip() for item in raw.split(",") if item.strip()]
    return order or fallback


def order_providers(providers: List[MediaProvider], payload: Dict[str, Any], media_kind: str) -> List[MediaProvider]:
    if media_kind != "video":
        return providers

    is_pro = is_media_pro(payload)
    env_name = "MEDIA_PRO_VIDEO_PROVIDER_ORDER" if is_pro else "MEDIA_VIDEO_PROVIDER_ORDER"
    fallback = DEFAULT_PRO_VIDEO_PROVIDER_ORDER if is_pro else DEFAULT_VIDEO_PROVIDER_ORDER
    priority = parse_provider_order(env_name, fallback)
    priority_index = {provider_id: index for index, provider_id in enumerate(priority)}
    return sorted(providers, key=lambda provider: priority_index.get(provider.id, len(priority_index) + 10))


def normalize_media_payload(kind: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    prompt = str(payload.get("prompt") or payload.get("question") or payload.get("message") or "").strip()
    style = str(payload.get("style") or "cinematic").strip()
    media_format = str(payload.get("format") or payload.get("aspectRatio") or payload.get("aspect_ratio") or "").strip()
    size = str(payload.get("size") or "").strip()
    if not media_format:
        if size in ("1024x1024", "1:1"):
            media_format = "1:1"
        elif size in ("768x1344", "1024x1536", "9:16"):
            media_format = "9:16"
        elif size in ("1344x768", "1536x1024", "16:9"):
            media_format = "16:9"
        else:
            media_format = "1:1"

    duration = int(payload.get("duration") or payload.get("durationSeconds") or 5)
    if duration not in (5, 8, 12):
        duration = 5

    quality = str(payload.get("quality") or os.environ.get("OPENAI_IMAGE_QUALITY", "high")).strip()
    return {
        "kind": kind,
        "prompt": prompt,
        "style": style,
        "format": media_format,
        "size": size or FORMAT_TO_OPENAI_SIZE.get(media_format, "1024x1024"),
        "quality": quality,
        "duration": duration,
    }


def generate_media_response(
    kind: str,
    payload: Dict[str, Any],
    *,
    storage_dir: str | Path,
    public_storage_prefix: str = "/api/storage/photos",
    client_id: str = "guest",
) -> Tuple[Dict[str, Any], int]:
    media_kind = "video" if kind == "video" else "photo"
    normalized = normalize_media_payload(media_kind, payload)
    client_key = normalize_client_id(
        str(payload.get("userEmail") or payload.get("email") or payload.get("username") or client_id)
    )

    if not normalized["prompt"]:
        return {
            "ok": False,
            "error": "missing_prompt",
            "message": "Prompt is required.",
            "kind": media_kind,
        }, 400

    if len(normalized["prompt"]) > _max_prompt_chars():
        return {
            "ok": False,
            "error": "prompt_too_long",
            "message": f"Prompt is too long. Limit: {_max_prompt_chars()} characters.",
            "kind": media_kind,
            "maxPromptChars": _max_prompt_chars(),
        }, 413

    if not is_media_pro(payload) and not can_use_free_media(client_key):
        return {
            "ok": False,
            "error": "pro_required",
            "message": "Free media generation limit reached. Enter MEDIA_PRO_ACCESS_CODE to continue.",
            "kind": media_kind,
            "freeLimit": _free_media_limit(),
        }, 402

    providers = order_providers(PHOTO_PROVIDERS if media_kind == "photo" else VIDEO_PROVIDERS, payload, media_kind)
    configured = [provider for provider in providers if provider.configured()]
    if not configured:
        return {
            "ok": False,
            "error": "providers_not_configured",
            "message": "Media providers are not configured. Add provider env variables in Render Dashboard.",
            "kind": media_kind,
            "providers": public_provider_status(media_kind),
            "storyboard": build_storyboard(normalized),
        }, 200

    errors: List[Dict[str, Any]] = []
    for provider in configured:
        try:
            if provider.mode == "openai-image":
                result = call_openai_image(provider, normalized, storage_dir, public_storage_prefix)
            else:
                result = call_media_provider(provider, normalized, storage_dir, public_storage_prefix)
            mark_media_used(client_key)
            result = normalize_inline_media_result(media_kind, result)
            return {
                "ok": True,
                "kind": media_kind,
                "mediaKind": "video" if media_kind == "video" else "image",
                "provider": provider.id,
                "providerTitle": provider.title,
                "prompt": normalized["prompt"],
                "style": normalized["style"],
                "format": normalized["format"],
                "aspectRatio": normalized["format"],
                "duration": normalized["duration"] if media_kind == "video" else None,
                "fallback": False,
                "status": result.get("status") or "ready",
                "providersTried": [item["provider"] for item in errors] + [provider.id],
                "storyboard": build_storyboard(normalized),
                **result,
            }, 200
        except Exception as exc:
            errors.append({"provider": provider.id, "error": str(exc)[:500], **humanize_provider_exception(exc)})

    return {
        "ok": False,
        "error": "provider_rotation_failed",
        "message": "All configured media providers failed. Check provider URLs, keys and Render logs.",
        "kind": media_kind,
        "providers": public_provider_status(media_kind),
        "errors": errors,
        "storyboard": build_storyboard(normalized),
    }, 502


def normalize_inline_media_result(media_kind: str, result: Dict[str, Any]) -> Dict[str, Any]:
    """Return Gemini-style chat friendly aliases without exposing secrets.

    Frontend cards look for url/mediaUrl/videoUrl/imageUrl. Providers return
    different shapes, so this makes one stable contract:
      - photo/image => imageUrl + mediaUrl + url
      - video       => videoUrl + mediaUrl + url
    """
    safe_result = dict(result or {})
    media_url = (
        safe_result.get("videoUrl")
        or safe_result.get("imageUrl")
        or safe_result.get("mediaUrl")
        or safe_result.get("assetUrl")
        or safe_result.get("url")
        or find_media_url(safe_result, "video" if media_kind == "video" else "photo")
    )
    if media_url:
        safe_result["url"] = media_url
        safe_result["mediaUrl"] = media_url
        safe_result["assetUrl"] = media_url
        if media_kind == "video":
            safe_result["videoUrl"] = media_url
        else:
            safe_result["imageUrl"] = media_url
        safe_result.setdefault("status", "ready")
    else:
        safe_result.setdefault("status", "submitted")
    return safe_result


def call_openai_image(
    provider: MediaProvider,
    normalized: Dict[str, Any],
    storage_dir: str | Path,
    public_storage_prefix: str,
) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("requests is not installed")

    model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1").strip()
    body = {
        "model": model,
        "prompt": build_provider_prompt(normalized),
        "size": FORMAT_TO_OPENAI_SIZE.get(normalized["format"], normalized["size"]),
        "quality": normalized["quality"],
        "n": 1,
    }
    response = requests.post(
        provider.url(),
        headers={
            "Authorization": f"Bearer {provider.api_key()}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=90,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"{provider.title} HTTP {response.status_code}: {response.text[:600]}")

    data = response.json()
    first = (data.get("data") or [{}])[0] if isinstance(data, dict) else {}
    if first.get("url"):
        return {"url": first["url"], "raw": compact_raw(data)}
    if first.get("b64_json"):
        filename, url = save_base64_image(first["b64_json"], storage_dir, public_storage_prefix)
        return {"url": url, "filename": filename, "raw": compact_raw(data)}
    raise RuntimeError("OpenAI image response did not include url or b64_json")


def call_media_provider(
    provider: MediaProvider,
    normalized: Dict[str, Any],
    storage_dir: str | Path,
    public_storage_prefix: str,
) -> Dict[str, Any]:
    if provider.mode == "google-veo":
        return call_google_veo(provider, normalized, storage_dir, public_storage_prefix)
    if provider.mode == "runway-video":
        return call_runway_video(provider, normalized)
    if provider.mode == "luma-video":
        return call_luma_video(provider, normalized)
    if provider.mode == "luma-image":
        return call_luma_image(provider, normalized)
    return call_generic_media_provider(provider, normalized)


def call_generic_media_provider(provider: MediaProvider, normalized: Dict[str, Any]) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("requests is not installed")

    body: Dict[str, Any] = {
        "prompt": build_provider_prompt(normalized),
        "style": normalized["style"],
        "aspect_ratio": normalized["format"],
        "format": normalized["format"],
        "duration": str(normalized["duration"]) if provider.mode == "fal-video" else normalized["duration"],
        "duration_seconds": normalized["duration"],
        "quality": normalized["quality"],
        "size": normalized["size"],
        "metadata": {
            "product": "Malik AI Sovereign",
            "providerRotation": True,
            "providerTier": provider.tier,
        },
    }
    if provider.model():
        body["model"] = provider.model()
    response = requests.post(
        provider.url(),
        headers=build_provider_headers(provider),
        json=body,
        timeout=180 if provider.kind == "video" else 90,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"{provider.title} HTTP {response.status_code}: {response.text[:600]}")

    data = response.json()
    media_url = find_media_url(data, provider.kind)
    if media_url:
        if provider.kind == "video":
            return {"videoUrl": media_url, "url": media_url, "raw": compact_raw(data)}
        return {"url": media_url, "raw": compact_raw(data)}
    return {"raw": compact_raw(data), "providerResponse": data}


def call_runway_video(provider: MediaProvider, normalized: Dict[str, Any]) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("requests is not installed")

    body = {
        "model": provider.model() or "gen4.5",
        "promptText": build_provider_prompt(normalized),
        "ratio": runway_ratio(normalized["format"]),
        "duration": min(int(normalized["duration"] or 5), 10),
    }
    response = requests.post(provider.url(), headers=build_provider_headers(provider), json=body, timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"{provider.title} HTTP {response.status_code}: {response.text[:600]}")

    data = response.json()
    media_url = find_media_url(data, "video")
    if media_url:
        return {"videoUrl": media_url, "url": media_url, "raw": compact_raw(data)}

    task_id = str(data.get("id") or data.get("taskId") or data.get("task_id") or "").strip()
    if not task_id:
        return {"raw": compact_raw(data), "providerResponse": data}

    task_url = os.environ.get("RUNWAY_TASK_URL", "").strip() or build_runway_task_url(provider.url(), task_id)
    result = poll_json_result(provider, task_url, build_provider_headers(provider), success_states={"SUCCEEDED"}, failed_states={"FAILED", "CANCELED"})
    media_url = find_media_url(result, "video")
    if media_url:
        return {"videoUrl": media_url, "url": media_url, "raw": compact_raw(result)}
    return {"raw": compact_raw(result), "providerResponse": result}


def call_luma_image(provider: MediaProvider, normalized: Dict[str, Any]) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("requests is not installed")

    body = {
        "prompt": build_provider_prompt(normalized),
        "model": provider.model() or "photon-1",
        "aspect_ratio": normalized["format"],
    }
    response = requests.post(provider.url(), headers=build_provider_headers(provider), json=body, timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"{provider.title} HTTP {response.status_code}: {response.text[:600]}")

    data = response.json()
    media_url = find_media_url(data, "photo")
    if media_url:
        return {"imageUrl": media_url, "url": media_url, "raw": compact_raw(data)}

    generation_id = str(data.get("id") or data.get("generation_id") or "").strip()
    if not generation_id:
        return {"raw": compact_raw(data), "providerResponse": data}

    status_url = os.environ.get("LUMA_STATUS_URL", "").strip() or build_luma_status_url(provider.url(), generation_id)
    result = poll_json_result(
        provider,
        status_url,
        build_provider_headers(provider),
        success_states={"completed", "COMPLETED"},
        failed_states={"failed", "FAILED"},
    )
    media_url = find_media_url(result, "photo")
    if media_url:
        return {"imageUrl": media_url, "url": media_url, "raw": compact_raw(result)}
    return {"raw": compact_raw(result), "providerResponse": result}


def call_luma_video(provider: MediaProvider, normalized: Dict[str, Any]) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("requests is not installed")

    duration = "9s" if int(normalized["duration"] or 5) >= 8 else "5s"
    body = {
        "prompt": build_provider_prompt(normalized),
        "model": provider.model() or "ray-2",
        "aspect_ratio": normalized["format"],
        "resolution": os.environ.get("LUMA_VIDEO_RESOLUTION", "720p"),
        "duration": os.environ.get("LUMA_VIDEO_DURATION", duration),
    }
    response = requests.post(provider.url(), headers=build_provider_headers(provider), json=body, timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"{provider.title} HTTP {response.status_code}: {response.text[:600]}")

    data = response.json()
    media_url = find_media_url(data, "video")
    if media_url:
        return {"videoUrl": media_url, "url": media_url, "raw": compact_raw(data)}

    generation_id = str(data.get("id") or data.get("generation_id") or "").strip()
    if not generation_id:
        return {"raw": compact_raw(data), "providerResponse": data}

    status_url = os.environ.get("LUMA_STATUS_URL", "").strip() or build_luma_status_url(provider.url(), generation_id)
    result = poll_json_result(provider, status_url, build_provider_headers(provider), success_states={"completed", "COMPLETED"}, failed_states={"failed", "FAILED"})
    media_url = find_media_url(result, "video")
    if media_url:
        return {"videoUrl": media_url, "url": media_url, "raw": compact_raw(result)}
    return {"raw": compact_raw(result), "providerResponse": result}


def call_google_veo(
    provider: MediaProvider,
    normalized: Dict[str, Any],
    storage_dir: str | Path,
    public_storage_prefix: str,
) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("requests is not installed")

    duration = int(normalized["duration"] or 8)
    if duration >= 8:
        veo_duration = "8"
    elif duration >= 6:
        veo_duration = "6"
    else:
        veo_duration = "4"

    body = {
        "instances": [{"prompt": build_provider_prompt(normalized)}],
        "parameters": {
            "aspectRatio": normalized["format"] if normalized["format"] in {"16:9", "9:16"} else "16:9",
            "durationSeconds": os.environ.get("GOOGLE_VEO_DURATION_SECONDS", veo_duration),
            "resolution": os.environ.get("GOOGLE_VEO_RESOLUTION", "720p"),
        },
    }
    negative_prompt = os.environ.get("GOOGLE_VEO_NEGATIVE_PROMPT", "").strip()
    if negative_prompt:
        body["parameters"]["negativePrompt"] = negative_prompt

    headers = build_provider_headers(provider)
    response = requests.post(provider.url(), headers=headers, json=body, timeout=60)
    if response.status_code >= 400:
        raise RuntimeError(f"{provider.title} HTTP {response.status_code}: {response.text[:600]}")

    data = response.json()
    operation_name = str(data.get("name") or data.get("operation") or "").strip()
    if not operation_name:
        media_url = find_media_url(data, "video")
        if media_url:
            return {"videoUrl": media_url, "url": media_url, "raw": compact_raw(data)}
        return {"raw": compact_raw(data), "providerResponse": data}

    status_url = os.environ.get("GOOGLE_VEO_STATUS_URL", "").strip() or build_google_operation_url(provider.url(), operation_name)
    result = poll_json_result(provider, status_url, headers, success_states={"done"}, failed_states={"failed", "FAILED"})
    media_url = find_media_url(result, "video")
    if not media_url:
        return {"raw": compact_raw(result), "providerResponse": result}

    filename, local_url = download_and_save_media(media_url, headers, storage_dir, public_storage_prefix, ".mp4")
    return {"videoUrl": local_url, "url": local_url, "filename": filename, "raw": compact_raw(result), "providerRemoteUrl": media_url}


def poll_json_result(
    provider: MediaProvider,
    url: str,
    headers: Dict[str, str],
    *,
    success_states: set[str],
    failed_states: set[str],
) -> Dict[str, Any]:
    max_seconds = int(os.environ.get("MEDIA_PROVIDER_POLL_SECONDS", "150") or 150)
    interval = int(os.environ.get("MEDIA_PROVIDER_POLL_INTERVAL", "5") or 5)
    deadline = time.time() + max_seconds
    last: Dict[str, Any] = {}

    while time.time() < deadline:
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code >= 400:
            raise RuntimeError(f"{provider.title} poll HTTP {response.status_code}: {response.text[:600]}")
        last = response.json()
        status = str(last.get("status") or last.get("state") or "").strip()
        if last.get("done") is True:
            return last
        if status in success_states:
            return last
        if status in failed_states:
            raise RuntimeError(f"{provider.title} generation failed: {compact_raw(last)}")
        time.sleep(interval)

    raise RuntimeError(f"{provider.title} generation timed out: {compact_raw(last)}")


def runway_ratio(format_value: str) -> str:
    return {
        "16:9": "1280:720",
        "9:16": "720:1280",
        "1:1": "960:960",
    }.get(format_value, "1280:720")


def build_runway_task_url(create_url: str, task_id: str) -> str:
    base = create_url.split("/v1/")[0].rstrip("/")
    return f"{base}/v1/tasks/{task_id}"


def build_luma_status_url(create_url: str, generation_id: str) -> str:
    clean = create_url.rstrip("/")
    if clean.endswith("/video"):
        clean = clean[: -len("/video")]
    if clean.endswith("/image"):
        clean = clean[: -len("/image")]
    return f"{clean}/{generation_id}"


def build_google_operation_url(create_url: str, operation_name: str) -> str:
    base = create_url.split("/models/")[0].rstrip("/")
    return f"{base}/{operation_name.lstrip('/')}"


def download_and_save_media(
    media_url: str,
    headers: Dict[str, str],
    storage_dir: str | Path,
    public_storage_prefix: str,
    extension: str,
) -> Tuple[str, str]:
    folder = Path(storage_dir)
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"malik_media_{int(time.time())}_{uuid.uuid4().hex[:8]}{extension}"
    target = folder / filename
    response = requests.get(media_url, headers=headers, timeout=180)
    if response.status_code >= 400:
        raise RuntimeError(f"media download HTTP {response.status_code}: {response.text[:300]}")
    target.write_bytes(response.content)
    return filename, f"{public_storage_prefix.rstrip('/')}/{filename}"


def build_provider_headers(provider: MediaProvider) -> Dict[str, str]:
    token = provider.api_key()
    if provider.mode == "google-veo":
        return {
            "x-goog-api-key": token,
            "Content-Type": "application/json",
        }
    if provider.mode == "runway-video":
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Runway-Version": os.environ.get("RUNWAY_API_VERSION", "2024-11-06"),
        }
    if provider.id.startswith("fal-") or provider.mode == "fal-video":
        auth_value = f"Key {token}"
    else:
        auth_value = f"Bearer {token}"
    return {
        "Authorization": auth_value,
        "Content-Type": "application/json",
    }


def build_provider_prompt(normalized: Dict[str, Any]) -> str:
    base = normalized["prompt"]
    style = normalized["style"]
    aspect = normalized["format"]
    if normalized["kind"] == "video":
        return f"{base}\nStyle: {style}. Aspect ratio: {aspect}. Duration: {normalized['duration']} seconds."
    return f"{base}\nStyle: {style}. Aspect ratio: {aspect}. Quality: {normalized['quality']}."


def find_media_url(value: Any, kind: str) -> str:
    preferred_keys = (
        ["video_url", "videoUrl", "video", "url", "output", "assetUrl"]
        if kind == "video"
        else ["image_url", "imageUrl", "image", "url", "output", "assetUrl"]
    )

    if isinstance(value, str):
        if value.startswith("http://") or value.startswith("https://") or value.startswith("data:"):
            return value
        return ""
    if isinstance(value, list):
        for item in value:
            found = find_media_url(item, kind)
            if found:
                return found
        return ""
    if isinstance(value, dict):
        for key in preferred_keys:
            if key in value:
                found = find_media_url(value[key], kind)
                if found:
                    return found
        for item in value.values():
            found = find_media_url(item, kind)
            if found:
                return found
    return ""


def save_base64_image(encoded: str, storage_dir: str | Path, public_storage_prefix: str) -> Tuple[str, str]:
    folder = Path(storage_dir)
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"malik_media_{int(time.time())}_{uuid.uuid4().hex[:8]}.png"
    target = folder / filename
    target.write_bytes(base64.b64decode(encoded))
    return filename, f"{public_storage_prefix.rstrip('/')}/{filename}"


def build_storyboard(normalized: Dict[str, Any]) -> Dict[str, Any]:
    prompt = normalized.get("prompt") or "Malik AI media generation"
    style = normalized.get("style") or "cinematic"
    duration = normalized.get("duration") or 5
    return {
        "title": f"{style.title()} {normalized.get('kind', 'media')} plan",
        "prompt": prompt,
        "format": normalized.get("format") or "1:1",
        "duration": duration,
        "frames": [
            {"time": "00:00", "label": "Opening hook", "description": prompt[:90]},
            {"time": "00:02", "label": "Product reveal", "description": f"{style} lighting and premium motion"},
            {"time": f"00:{str(duration).zfill(2)}", "label": "Final CTA", "description": "Malik AI branded result frame"},
        ],
    }


def compact_raw(data: Any) -> Any:
    if isinstance(data, dict):
        compacted = {}
        for key, value in data.items():
            if key.lower() in {"b64_json", "base64", "image_b64"}:
                compacted[key] = "[base64 omitted]"
            else:
                compacted[key] = compact_raw(value)
        return compacted
    if isinstance(data, list):
        return [compact_raw(item) for item in data[:8]]
    return data



def humanize_provider_exception(exc: Exception | str) -> Dict[str, Any]:
    """Convert raw provider errors into UI-friendly hints without secrets."""
    text = str(exc or "")
    low = text.lower()
    payload: Dict[str, Any] = {"message": "Provider failed.", "hint": "Check provider settings and Render logs."}

    if "401" in low or "unauthorized" in low or "invalid api key" in low or "forbidden" in low:
        payload.update({
            "code": "invalid_key",
            "message": "Provider key is invalid, expired, or missing permissions.",
            "hint": "Rotate the API key in Render Environment and redeploy.",
        })
    elif "402" in low or "payment" in low or "billing" in low or "credits" in low or "balance" in low:
        payload.update({
            "code": "billing_required",
            "message": "Provider requires balance or credits.",
            "hint": "Add credits in the provider dashboard or change provider order.",
        })
    elif "429" in low or "rate limit" in low or "too many" in low:
        payload.update({
            "code": "rate_limited",
            "message": "Provider rate limit reached.",
            "hint": "Wait, reduce requests, or switch provider order.",
        })
    elif "400" in low or "bad request" in low or "invalid payload" in low or "model" in low:
        payload.update({
            "code": "bad_request",
            "message": "Provider rejected the request payload.",
            "hint": "Check model, duration, aspect ratio, and endpoint URL.",
        })
    elif "timeout" in low or "timed out" in low:
        payload.update({
            "code": "timeout",
            "message": "Generation took too long.",
            "hint": "Increase MEDIA_PROVIDER_POLL_SECONDS or try shorter duration.",
        })

    payload["safeDetail"] = text[:500]
    return payload


def media_runtime_status() -> Dict[str, Any]:
    """Public media status for UI. Returns booleans only, never secrets."""
    return {
        "ok": True,
        "module": "media-runtime",
        "photoProviders": public_provider_status("photo"),
        "videoProviders": public_provider_status("video"),
        "freeDailyLimit": _free_media_limit(),
        "maxPromptChars": _max_prompt_chars(),
        "providerPollSeconds": _safe_int_env("MEDIA_PROVIDER_POLL_SECONDS", 150, minimum=15, maximum=1800),
        "providerPollInterval": _safe_int_env("MEDIA_PROVIDER_POLL_INTERVAL", 5, minimum=1, maximum=60),
        "secretsExposed": False,
        "serverOnly": True,
    }

def configured_media_summary() -> Dict[str, Any]:
    return {
        "photo": public_provider_status("photo"),
        "video": public_provider_status("video"),
        "freeLimit": _free_media_limit(),
        "proAccessEnabled": bool(os.environ.get("MEDIA_PRO_ACCESS_CODE", "").strip()),
        "videoProviderOrder": parse_provider_order("MEDIA_VIDEO_PROVIDER_ORDER", DEFAULT_VIDEO_PROVIDER_ORDER),
        "proVideoProviderOrder": parse_provider_order("MEDIA_PRO_VIDEO_PROVIDER_ORDER", DEFAULT_PRO_VIDEO_PROVIDER_ORDER),
        "secretsExposed": False,
        "serverOnly": True,
        "note": "Only env variable names and configured booleans are returned; secret values stay server-side.",
    }


def runtime_env_check() -> Dict[str, Any]:
    providers = []
    for provider in [*PHOTO_PROVIDERS, *VIDEO_PROVIDERS]:
        configured = provider.configured()
        providers.append(
            {
                "id": provider.id,
                "name": provider.title,
                "kind": provider.kind,
                "configured": configured,
                "status": "online" if configured else "missing",
                "keyConfigured": provider.key_configured(),
                "urlConfigured": provider.url_configured(),
                "keyEnv": provider.api_key_env,
                "keyAliasEnv": list(provider.key_envs()[1:]),
                "urlEnv": provider.url_env,
                "requiredEnv": provider.required_env_names(),
                "docsUrl": provider.docs_url,
                "keyUrl": provider.key_url,
                "mode": provider.mode,
                "tier": provider.tier,
                "model": provider.model(),
                "hasDefaultUrl": bool(provider.default_url),
            }
        )

    return {
        "ok": True,
        "module": "media-env-check",
        "secretsExposed": False,
        "message": "Runtime env check completed without exposing secret values.",
        "media": configured_media_summary(),
        "providers": providers,
    }
