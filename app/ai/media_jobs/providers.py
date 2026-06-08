from __future__ import annotations

import base64
import json
import os
import time
import uuid
from pathlib import Path
from typing import Tuple
from urllib.parse import quote, urlparse

import requests

BASE_DIR = Path(__file__).resolve().parents[3]
PHOTO_STORAGE_DIR = BASE_DIR / "app" / "static" / "storage" / "photos"
VIDEO_STORAGE_DIR = BASE_DIR / "app" / "static" / "storage" / "videos"
PHOTO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _keys(name: str) -> list[str]:
    return [x.strip() for x in _env(name).split(",") if x.strip()]


def _any(*names: str) -> bool:
    return any(_keys(n) for n in names)


def _aws_ready() -> bool:
    return bool(_env("AWS_REGION") and _env("AWS_ACCESS_KEY_ID"))


def image_provider_status() -> dict:
    return {
        "awsBedrock": _aws_ready(),
        "openai": _any("OPENAI_API_KEY", "OPENAI_KEYS"),
        "stability": _any("STABILITY_API_KEY", "STABILITY_KEYS"),
        "replicate": _any("REPLICATE_API_TOKEN", "REPLICATE_API_KEY", "REPLICATE_KEYS"),
        "gemini": _any("GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_KEYS"),
        "pollinationsFallback": True,
    }


def video_provider_status() -> dict:
    return {
        "awsBedrock": _aws_ready(),
        "runway": _any("RUNWAY_API_KEY", "RUNWAY_KEYS"),
        "replicate": _any("REPLICATE_API_TOKEN", "REPLICATE_API_KEY", "REPLICATE_KEYS"),
        "veo": _any("VEO_API_KEY", "GOOGLE_VEO_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_KEYS"),
        "kling": bool(_env("KLING_API_KEY")),
        "pika": bool(_env("PIKA_API_KEY")),
        "safePlanFallback": True,
    }


def _prompt(data: dict) -> str:
    return str(data.get("prompt") or data.get("question") or data.get("message") or "").strip()


def _size(data: dict) -> Tuple[int, int]:
    raw = str(data.get("size") or "1024x1024").lower().strip()
    if "x" in raw:
        try:
            w, h = raw.split("x", 1)
            return min(max(int(w), 512), 2048), min(max(int(h), 512), 2048)
        except Exception:
            pass
    return 1024, 1024


def _duration(data: dict) -> int:
    """Nova Reel accepts fixed enum durations. Normalize UI defaults like 5."""
    try:
        requested = int(data.get("durationSeconds") or data.get("duration") or 6)
    except Exception:
        requested = 6
    return 6 if requested <= 6 else 12


def _dimension(data: dict) -> str:
    raw = str(data.get("dimension") or data.get("size") or "").strip()
    if raw in {"1280x720", "720x1280", "1024x1024"}:
        return raw
    return "1280x720"


def _english_prompt(prompt: str, kind: str) -> str:
    text = (prompt or "").strip()
    replacements = {
        "сгенерируй": "generate", "сделай": "create", "фото": "photo", "картинку": "image", "изображение": "image",
        "видео": "video", "футболиста": "a football player", "футболист": "football player", "ночным": "night",
        "ночной": "night", "неоновым": "neon", "неоновый": "neon", "городом": "city", "город": "city",
        "заката": "sunset", "закат": "sunset", "трансформер": "transformer robot", "летает": "flying",
        "қысқа": "short", "бейне": "video", "сурет": "image", "футболшы": "football player", "қала": "city", "түнгі": "night",
    }
    out = text
    for source, target in replacements.items():
        out = out.replace(source, target).replace(source.capitalize(), target)
    if any(ord(ch) > 127 for ch in out):
        out = f"Create a premium {kind} based on this request: {text}"
    suffix = "Photorealistic, cinematic lighting, ultra detailed, premium composition." if kind == "image" else "Short cinematic video, smooth camera motion, premium advertising look."
    return f"{out}. {suffix}"[:1000]


def _save_b64_image(encoded: str, provider: str) -> str:
    filename = f"{provider}_{int(time.time())}_{uuid.uuid4().hex[:8]}.png"
    (PHOTO_STORAGE_DIR / filename).write_bytes(base64.b64decode(encoded))
    return f"/api/storage/photos/{filename}"


def _save_video_plan(plan: dict) -> str:
    filename = f"video_job_{int(time.time())}_{uuid.uuid4().hex[:8]}.json"
    (VIDEO_STORAGE_DIR / filename).write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    return f"/api/storage/videos/{filename}"


def _pollinations_image(data: dict, errors: list[dict] | None = None) -> dict:
    prompt = _english_prompt(_prompt(data) or "cinematic football player", "image")
    width, height = _size(data)
    url = f"https://image.pollinations.ai/prompt/{quote(prompt)}?width={width}&height={height}&nologo=true&enhance=true"
    return {"provider": "pollinations", "model": "fallback", "resultUrl": url, "url": url, "imageUrl": url, "mediaUrl": url, "fallback": True, "errors": errors or []}


def _openai_image(data: dict) -> dict | None:
    keys = _keys("OPENAI_API_KEY") or _keys("OPENAI_KEYS")
    if not keys:
        return None
    response = requests.post(
        "https://api.openai.com/v1/images/generations",
        headers={"Authorization": f"Bearer {keys[0]}", "Content-Type": "application/json"},
        json={"model": _env("OPENAI_IMAGE_MODEL", "gpt-image-1"), "prompt": _english_prompt(_prompt(data), "image"), "size": "1024x1024", "n": 1},
        timeout=120,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"openai_image_http_{response.status_code}: {response.text[:400]}")
    item = (response.json().get("data") or [{}])[0]
    url = item.get("url") or (_save_b64_image(item.get("b64_json"), "openai") if item.get("b64_json") else "")
    if not url:
        raise RuntimeError("openai_image_empty_result")
    return {"provider": "openai", "model": _env("OPENAI_IMAGE_MODEL", "gpt-image-1"), "resultUrl": url, "url": url, "imageUrl": url, "mediaUrl": url, "fallback": False}


def _bedrock_client():
    try:
        import boto3
    except Exception as exc:
        raise RuntimeError("boto3_missing_redeploy_latest_commit") from exc
    return boto3.client("bedrock-runtime", region_name=_env("AWS_REGION", "eu-west-1"))


def _s3_client():
    try:
        import boto3
    except Exception as exc:
        raise RuntimeError("boto3_missing_redeploy_latest_commit") from exc
    return boto3.client("s3", region_name=_env("AWS_REGION", "eu-west-1"))


def _parse_s3_uri(s3_uri: str) -> tuple[str, str]:
    parsed = urlparse(s3_uri)
    if parsed.scheme != "s3" or not parsed.netloc:
        raise RuntimeError("invalid_s3_uri")
    return parsed.netloc, parsed.path.lstrip("/")


def _latest_s3_video_url(s3_uri: str) -> str:
    bucket, prefix = _parse_s3_uri(s3_uri)
    s3 = _s3_client()
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    items = response.get("Contents") or []
    videos = [item for item in items if str(item.get("Key", "")).lower().endswith((".mp4", ".mov", ".webm"))]
    if not videos:
        return ""
    latest = max(videos, key=lambda item: item.get("LastModified") or 0)
    key = latest["Key"]
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=int(_env("AWS_BEDROCK_VIDEO_URL_EXPIRES", "3600") or "3600"),
    )


def _aws_image(data: dict) -> dict | None:
    if not _aws_ready():
        return None
    model = _env("AWS_BEDROCK_IMAGE_MODEL", "amazon.nova-canvas-v1:0")
    width, height = _size(data)
    body = {
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {"text": _english_prompt(_prompt(data), "image")},
        "imageGenerationConfig": {"numberOfImages": 1, "quality": "premium", "cfgScale": 8.0, "height": height, "width": width, "seed": int(time.time() % 2147483647)},
    }
    result = _bedrock_client().invoke_model(modelId=model, contentType="application/json", accept="application/json", body=json.dumps(body))
    payload = json.loads(result["body"].read())
    images = payload.get("images") or []
    if not images:
        raise RuntimeError(f"aws_canvas_empty_result: {json.dumps(payload)[:400]}")
    url = _save_b64_image(images[0], "aws_nova_canvas")
    return {"provider": "aws-bedrock", "model": model, "resultUrl": url, "url": url, "imageUrl": url, "mediaUrl": url, "fallback": False}


def _aws_video(data: dict) -> dict | None:
    if not _aws_ready():
        return None
    model = _env("AWS_BEDROCK_VIDEO_MODEL", "amazon.nova-reel-v1:0")
    s3_uri = _env("AWS_BEDROCK_VIDEO_S3_URI") or _env("AWS_VIDEO_OUTPUT_S3_URI")
    prompt = _english_prompt(_prompt(data), "video")
    if not s3_uri:
        plan = {
            "provider": "aws-bedrock",
            "model": model,
            "status": "needs_s3_output",
            "prompt": prompt,
            "message": "Video is not rendered yet. Add AWS_BEDROCK_VIDEO_S3_URI=s3://bucket/prefix/ for Amazon Nova Reel output.",
            "fallback": False,
        }
        plan["diagnosticUrl"] = _save_video_plan(plan)
        return plan
    try:
        bedrock = _bedrock_client()
        started = bedrock.start_async_invoke(
            modelId=model,
            modelInput={
                "taskType": "TEXT_VIDEO",
                "textToVideoParams": {"text": prompt},
                "videoGenerationConfig": {
                    "durationSeconds": _duration(data),
                    "fps": 24,
                    "dimension": _dimension(data),
                    "seed": int(time.time() % 2147483647),
                },
            },
            outputDataConfig={"s3OutputDataConfig": {"s3Uri": s3_uri}},
        )
        invocation_arn = started.get("invocationArn")
        wait_seconds = max(10, min(180, int(_env("AWS_BEDROCK_VIDEO_WAIT_SECONDS", "120") or "120")))
        deadline = time.time() + wait_seconds
        last_status = "Submitted"

        while invocation_arn and time.time() < deadline:
            time.sleep(5)
            state = bedrock.get_async_invoke(invocationArn=invocation_arn)
            last_status = str(state.get("status") or state.get("invocationStatus") or last_status)
            if last_status.lower() in {"completed", "complete", "succeeded", "success"}:
                video_url = _latest_s3_video_url(s3_uri)
                if video_url:
                    return {
                        "provider": "aws-bedrock",
                        "providerTitle": "Amazon Nova Reel",
                        "model": model,
                        "status": "ready",
                        "message": "Nova Reel video rendered and signed S3 URL returned.",
                        "resultUrl": video_url,
                        "url": video_url,
                        "videoUrl": video_url,
                        "mediaUrl": video_url,
                        "s3Uri": s3_uri,
                        "invocationArn": invocation_arn,
                        "fallback": False,
                    }
                break
            if last_status.lower() in {"failed", "failure", "error"}:
                raise RuntimeError(f"nova_reel_failed: {json.dumps(state, default=str)[:500]}")

        plan = {
            "provider": "aws-bedrock",
            "providerTitle": "Amazon Nova Reel",
            "model": model,
            "status": "rendering",
            "prompt": prompt,
            "message": f"Nova Reel job started but MP4 is still rendering. Last AWS status: {last_status}. Check S3 bucket in a few minutes.",
            "s3Uri": s3_uri,
            "invocationArn": invocation_arn,
            "fallback": False,
        }
        plan["diagnosticUrl"] = _save_video_plan(plan)
        return plan
    except Exception as exc:
        plan = {"provider": "aws-bedrock", "model": model, "status": "aws_video_failed", "prompt": prompt, "message": str(exc)[:700], "fallback": False}
        plan["diagnosticUrl"] = _save_video_plan(plan)
        return plan


def generate_image(input_data: dict) -> dict:
    if not _prompt(input_data):
        raise RuntimeError("Prompt is required.")
    errors: list[dict] = []
    for fn in (_aws_image, _openai_image):
        try:
            output = fn(input_data)
            if output:
                output["errors"] = errors
                return output
        except Exception as exc:
            errors.append({"provider": fn.__name__, "error": str(exc)[:500]})
    return _pollinations_image(input_data, errors)


def generate_video(input_data: dict) -> dict:
    if not _prompt(input_data):
        raise RuntimeError("Prompt is required.")
    output = _aws_video(input_data)
    if output:
        return output
    plan = {"provider": "safe-video-plan", "model": "local", "status": "safe_fallback", "prompt": _english_prompt(_prompt(input_data), "video"), "message": "No real video provider completed yet.", "fallback": True}
    plan["diagnosticUrl"] = _save_video_plan(plan)
    return plan
