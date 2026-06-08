"""API modules for Malik AI.

This package keeps backend helper modules small, import-safe and server-only.
It must never expose secret env values to the browser.
"""

from __future__ import annotations

import importlib.abc
import importlib.machinery
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

API_BOOT_TIME = time.time()
API_VERSION = os.environ.get("MALIK_API_VERSION", "v1-beta").strip() or "v1-beta"


def _configured(env_name: str) -> bool:
    """Return True only when an env variable exists.

    Important: this function never returns the value itself, only a boolean.
    """
    return bool(os.environ.get(env_name, "").strip())


def configured_flags(env_names: Iterable[str]) -> Dict[str, bool]:
    """Build a no-secrets env status map."""
    return {name: _configured(name) for name in env_names}


def api_metadata() -> Dict[str, Any]:
    """Small health payload used by routes and status panels."""
    return {
        "ok": True,
        "module": "app.api",
        "version": API_VERSION,
        "uptimeSeconds": int(time.time() - API_BOOT_TIME),
        "serverOnly": True,
        "secretsExposed": False,
    }


def core_provider_flags() -> Dict[str, Any]:
    """Safe configured booleans for product status UI."""
    return {
        "auth": configured_flags(
            [
                "NEXT_PUBLIC_SUPABASE_URL",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                "SUPABASE_URL",
                "SUPABASE_SERVICE_ROLE_KEY",
            ]
        ),
        "ai": configured_flags(
            [
                "OPENAI_API_KEY",
                "GROQ_API_KEY",
                "XAI_API_KEY",
                "GEMINI_API_KEY",
            ]
        ),
        "media": configured_flags(
            [
                "LUMA_API_KEY",
                "FAL_KEY",
                "RUNWAYML_API_SECRET",
                "GOOGLE_VEO_API_KEY",
                "STABILITY_API_KEY",
                "REPLICATE_API_TOKEN",
                "AWS_REGION",
                "AWS_BEDROCK_IMAGE_MODEL",
                "AWS_BEDROCK_VIDEO_MODEL",
                "AWS_BEDROCK_VIDEO_S3_URI",
            ]
        ),
        "billing": configured_flags(
            [
                "MEDIA_PRO_ACCESS_CODE",
                "STRIPE_SECRET_KEY",
                "KASPI_WEBHOOK_SECRET",
                "MALIK_BILLING_WEBHOOK_SECRET",
            ]
        ),
    }


def build_runtime_status(extra: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        **api_metadata(),
        "providers": core_provider_flags(),
    }
    if extra:
        payload.update(extra)
    return payload


def _legacy_media_bridge(
    kind: str,
    payload: Dict[str, Any],
    *,
    storage_dir: str | Path,
    public_storage_prefix: str = "/api/storage/photos",
    client_id: str = "guest",
) -> Tuple[Dict[str, Any], int]:
    """Route old /api/generate/photo|video calls into the Stage 3 media engine."""
    prompt = str(payload.get("prompt") or payload.get("question") or payload.get("message") or "").strip()
    media_kind = "video" if kind == "video" else "photo"
    if not prompt:
        return {"ok": False, "error": "missing_prompt", "message": "Prompt is required.", "kind": media_kind}, 400

    try:
        from app.ai.media_jobs.providers import generate_image, generate_video

        safe_payload = dict(payload)
        if media_kind == "video":
            # Nova Reel rejects the UI default duration=5. Force a valid short job.
            safe_payload["durationSeconds"] = 6
            safe_payload["duration"] = 6

        result = generate_video(safe_payload) if media_kind == "video" else generate_image(safe_payload)
        status = str(result.get("status") or "").strip()
        if media_kind == "video" and status == "needs_s3_output":
            return {
                "ok": False,
                "kind": "video",
                "mediaKind": "video",
                "error": "video_s3_output_required",
                "status": "needs_s3_output",
                "provider": result.get("provider") or "aws-bedrock",
                "providerTitle": "Amazon Nova Reel",
                "model": result.get("model"),
                "prompt": prompt,
                "message": "Видео ещё не создано: для Amazon Nova Reel нужен S3 output. Добавь AWS_BEDROCK_VIDEO_S3_URI=s3://bucket/prefix/ в Render и права S3, потом redeploy.",
                "diagnosticUrl": result.get("diagnosticUrl"),
                "fallback": False,
            }, 200

        media_url = result.get("videoUrl") or result.get("imageUrl") or result.get("mediaUrl") or result.get("resultUrl") or result.get("url")
        response: Dict[str, Any] = {
            "ok": True,
            "kind": media_kind,
            "mediaKind": "video" if media_kind == "video" else "image",
            "prompt": prompt,
            "provider": result.get("provider") or "stage3-media",
            "providerTitle": result.get("providerTitle") or result.get("provider") or "Stage 3 Media",
            "model": result.get("model"),
            "status": result.get("status") or "ready",
            "fallback": bool(result.get("fallback")),
            "url": media_url,
            "mediaUrl": media_url,
            "resultUrl": media_url,
            "message": result.get("message") or "Generated by Malik AI media bridge.",
            **result,
        }
        if media_kind == "video":
            response["videoUrl"] = media_url
        else:
            response["imageUrl"] = media_url
        return response, 200
    except Exception as exc:
        return {
            "ok": False,
            "error": "media_bridge_failed",
            "message": str(exc)[:500],
            "kind": media_kind,
            "provider": "stage3-media-bridge",
        }, 502


def _patch_generators_module(module: Any) -> None:
    if getattr(module, "_MALIK_STAGE3_BRIDGE", False):
        return
    module.generate_media_response = _legacy_media_bridge
    module._MALIK_STAGE3_BRIDGE = True


class _GeneratorsBridgeLoader(importlib.abc.Loader):
    def __init__(self, wrapped: importlib.abc.Loader):
        self.wrapped = wrapped

    def create_module(self, spec):  # type: ignore[override]
        create_module = getattr(self.wrapped, "create_module", None)
        if create_module:
            return create_module(spec)
        return None

    def exec_module(self, module):  # type: ignore[override]
        self.wrapped.exec_module(module)  # type: ignore[attr-defined]
        _patch_generators_module(module)


class _GeneratorsBridgeFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname: str, path: Any = None, target: Any = None):  # type: ignore[override]
        if fullname != "app.api.generators":
            return None
        spec = importlib.machinery.PathFinder.find_spec(fullname, path)
        if spec and spec.loader and not isinstance(spec.loader, _GeneratorsBridgeLoader):
            spec.loader = _GeneratorsBridgeLoader(spec.loader)  # type: ignore[assignment]
        return spec


def _install_generators_bridge() -> None:
    if any(isinstance(item, _GeneratorsBridgeFinder) for item in sys.meta_path):
        return
    sys.meta_path.insert(0, _GeneratorsBridgeFinder())
    existing = sys.modules.get("app.api.generators")
    if existing is not None:
        _patch_generators_module(existing)


_install_generators_bridge()


__all__ = [
    "API_VERSION",
    "api_metadata",
    "configured_flags",
    "core_provider_flags",
    "build_runtime_status",
]
