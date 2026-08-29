from __future__ import annotations

import base64
import json
import os
import re
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


def _clean_image_request(prompt: str) -> str:
    text = str(prompt or "").strip()
    text = re.sub(r"^\s*/(?:image|img|photo|foto|фото|картинка)\s*:?[\s-]*", "", text, flags=re.IGNORECASE)
    text = re.sub(
        r"^\s*(?:пожалуйста[,.!\s-]*)?(?:сгенерируй|сгенеруй|сгенерировать|создай|сделай|нарисуй|generate|create|draw|make)\s+(?:мне\s+)?",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", text).strip() or str(prompt or "").strip()


def _strict_image_prompt(prompt: str) -> str:
    """Build a short literal prompt without diluting the user's visual nouns.

    Modern image models can read Russian and Kazakh. Keeping the untouched
    request is safer than a large creative rewrite; small English anchors only
    recover the most common ASR/typo variants.
    """
    request = _clean_image_request(prompt)[:1200]
    lower = request.lower().replace("ё", "е")
    anchors: list[str] = []

    if re.search(r"спорт\s*кар|спорткар|sports?\s*car|supercar", lower):
        anchors.append("one sports car as the main subject")
    elif re.search(r"машин|автомоб|\bcar\b|vehicle", lower):
        anchors.append("the requested car or vehicle as the main subject")
    if re.search(r"лягуш|лягушк|бақа|\bfrog\b", lower):
        anchors.append("a frog as the main subject")
    if re.search(r"кот|кошк|мысық|\bcat\b|kitten", lower):
        anchors.append("a cat as the main subject")
    if re.search(r"собак|щен|ит\b|\bdog\b|puppy", lower):
        anchors.append("a dog as the main subject")
    if re.search(r"робот|трансформ|\brobot\b|mecha|transformer", lower):
        anchors.append("the requested robot as the main subject")
    if re.search(r"летящ|летающ|летит|ұшатын|ұшып|\bfly(?:ing)?\b|airborne", lower):
        anchors.append("clearly flying in the air")

    facts = "; ".join(dict.fromkeys(anchors))
    fact_line = f" Required visible facts: {facts}." if facts else ""
    return (
        f"Create exactly one image from this literal user request: {request}."
        f"{fact_line} Preserve the exact subject, action, count, colors and setting. "
        "Do not replace the main subject, do not make a four-panel collage, and do not add unrelated people, animals, text or watermarks."
    )[:1800]


def _save_b64_image(encoded: str, provider: str) -> str:
    filename = f"{provider}_{int(time.time())}_{uuid.uuid4().hex[:8]}.png"
    (PHOTO_STORAGE_DIR / filename).write_bytes(base64.b64decode(encoded))
    return f"/api/storage/photos/{filename}"


def _save_image_bytes(content: bytes, provider: str, content_type: str = "image/png") -> str:
    extension = ".jpg" if "jpeg" in content_type or "jpg" in content_type else ".webp" if "webp" in content_type else ".png"
    filename = f"{provider}_{int(time.time())}_{uuid.uuid4().hex[:10]}{extension}"
    (PHOTO_STORAGE_DIR / filename).write_bytes(content)
    return f"/api/storage/photos/{filename}"


def _cloudflare_credentials() -> tuple[str, str]:
    account = _env("CLOUDFLARE_IMAGE_ACCOUNT_ID") or _env("CLOUDFLARE_ACCOUNT_ID") or _env("CF_ACCOUNT_ID")
    token = _env("CLOUDFLARE_IMAGE_API_TOKEN") or _env("CLOUDFLARE_API_TOKEN") or _env("CF_API_TOKEN")
    return account, token


def _cloudflare_model(model_id: str) -> tuple[str, str]:
    models = {
        "flux-klein-4b": ("@cf/black-forest-labs/flux-2-klein-4b", "multipart"),
        "flux-schnell": ("@cf/black-forest-labs/flux-1-schnell", "json"),
        "leonardo-phoenix": ("@cf/leonardo/phoenix-1.0", "json"),
        "leonardo-lucid": ("@cf/leonardo/lucid-origin", "json"),
        "malik-image-1-premium": ("@cf/black-forest-labs/flux-2-dev", "multipart"),
    }
    return models.get(model_id, models["flux-klein-4b"])


def _cloudflare_image(data: dict) -> dict | None:
    account, token = _cloudflare_credentials()
    if not account or not token:
        return None

    model_id = str(data.get("modelId") or "flux-klein-4b").strip()
    model, request_kind = _cloudflare_model(model_id)
    prompt = _strict_image_prompt(_prompt(data))
    width, height = _size(data)
    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}"
    headers = {"Authorization": f"Bearer {token}"}

    if request_kind == "multipart":
        response = requests.post(
            endpoint,
            headers=headers,
            files={"prompt": (None, prompt), "width": (None, str(width)), "height": (None, str(height))},
            timeout=(10, 55),
        )
    else:
        body = {"prompt": prompt, "width": width, "height": height}
        if model_id == "flux-schnell":
            body = {"prompt": prompt, "steps": 4}
        else:
            body.update({"num_steps": 22, "guidance": 7.5})
        response = requests.post(
            endpoint,
            headers={**headers, "Content-Type": "application/json"},
            json=body,
            timeout=(10, 55),
        )

    if response.status_code >= 400:
        raise RuntimeError(f"cloudflare_image_http_{response.status_code}: {response.text[:350]}")

    content_type = response.headers.get("content-type", "")
    if content_type.startswith("image/"):
        if len(response.content) < 4096:
            raise RuntimeError("cloudflare_image_too_small")
        url = _save_image_bytes(response.content, "cloudflare", content_type)
    else:
        payload = response.json()
        result = payload.get("result") or payload
        encoded = result.get("image") if isinstance(result, dict) else ""
        if not encoded:
            raise RuntimeError("cloudflare_image_empty_result")
        url = _save_b64_image(encoded, "cloudflare")

    return {
        "provider": "cloudflare",
        "model": model,
        "modelId": model_id,
        "resultUrl": url,
        "url": url,
        "imageUrl": url,
        "mediaUrl": url,
        "fallback": False,
        "prompt": prompt,
    }


def _save_video_plan(plan: dict) -> str:
    filename = f"video_job_{int(time.time())}_{uuid.uuid4().hex[:8]}.json"
    (VIDEO_STORAGE_DIR / filename).write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    return f"/api/storage/videos/{filename}"


def _pollinations_image(data: dict, errors: list[dict] | None = None) -> dict:
    prompt = _strict_image_prompt(_prompt(data) or "cinematic subject")
    width, height = _size(data)
    seed = int(time.time_ns() % 2_147_483_647)
    remote_url = (
        f"https://image.pollinations.ai/prompt/{quote(prompt)}"
        f"?width={width}&height={height}&model=flux&seed={seed}"
        "&nologo=true&private=true&enhance=false"
    )
    response = requests.get(remote_url, timeout=(10, 50), headers={"Cache-Control": "no-cache"})
    if response.status_code >= 400:
        raise RuntimeError(f"pollinations_image_http_{response.status_code}")
    content_type = response.headers.get("content-type", "image/jpeg")
    if not content_type.startswith("image/") or len(response.content) < 4096:
        raise RuntimeError("pollinations_invalid_image_result")
    url = _save_image_bytes(response.content, "pollinations", content_type)
    return {
        "provider": "pollinations",
        "model": "flux",
        "resultUrl": url,
        "url": url,
        "imageUrl": url,
        "mediaUrl": url,
        "fallback": True,
        "errors": errors or [],
        "prompt": prompt,
    }


def _openai_image(data: dict) -> dict | None:
    keys = _keys("OPENAI_API_KEY") or _keys("OPENAI_KEYS")
    if not keys:
        return None
    response = requests.post(
        "https://api.openai.com/v1/images/generations",
        headers={"Authorization": f"Bearer {keys[0]}", "Content-Type": "application/json"},
        json={"model": _env("OPENAI_IMAGE_MODEL", "gpt-image-1"), "prompt": _strict_image_prompt(_prompt(data)), "size": "1024x1024", "n": 1},
        timeout=(10, 75),
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
        "textToImageParams": {"text": _strict_image_prompt(_prompt(data))},
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
    # The selected fast Cloudflare model is authoritative. Do not silently
    # spend minutes rotating through unrelated providers before trying it.
    for fn in (_cloudflare_image, _openai_image, _aws_image):
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
