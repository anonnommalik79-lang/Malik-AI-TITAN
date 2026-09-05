from __future__ import annotations

import json
import mimetypes
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

import boto3
import httpx
from botocore.config import Config

BASE_URL = os.getenv("MALIK_SHORTS_WORKER_BASE_URL", "https://malikaiworld.world").rstrip("/")
TOKEN = os.getenv("MALIK_SHORTS_WORKER_TOKEN", "").strip()
WORKER_ID = os.getenv("MALIK_SHORTS_WORKER_ID", "media-ffmpeg-1").strip() or "media-ffmpeg-1"
POLL_SECONDS = max(1.0, float(os.getenv("MALIK_SHORTS_MEDIA_POLL_SECONDS", "3")))
HTTP_TIMEOUT = max(15.0, float(os.getenv("MALIK_SHORTS_MEDIA_HTTP_TIMEOUT_SECONDS", "120")))
FFMPEG = os.getenv("FFMPEG_BIN", "ffmpeg").strip() or "ffmpeg"
FFPROBE = os.getenv("FFPROBE_BIN", "ffprobe").strip() or "ffprobe"

S3_ENDPOINT = os.getenv("MALIK_SHORTS_S3_ENDPOINT", "").strip()
S3_REGION = os.getenv("MALIK_SHORTS_S3_REGION", "auto").strip() or "auto"
S3_BUCKET = os.getenv("MALIK_SHORTS_S3_BUCKET", "").strip()
S3_ACCESS_KEY = os.getenv("MALIK_SHORTS_S3_ACCESS_KEY_ID", "").strip()
S3_SECRET_KEY = os.getenv("MALIK_SHORTS_S3_SECRET_ACCESS_KEY", "").strip()
PUBLIC_BASE = os.getenv("MALIK_SHORTS_PUBLIC_CDN_URL", "").strip().rstrip("/")

CLAIM_TYPES = ["probe", "thumbnail", "transcode_hls"]
BITRATES = {360: 800, 540: 1500, 720: 2800, 1080: 5000}


def require_runtime() -> None:
    missing = []
    if len(TOKEN) < 32:
        missing.append("MALIK_SHORTS_WORKER_TOKEN")
    for name, value in [
        ("MALIK_SHORTS_S3_ENDPOINT", S3_ENDPOINT),
        ("MALIK_SHORTS_S3_BUCKET", S3_BUCKET),
        ("MALIK_SHORTS_S3_ACCESS_KEY_ID", S3_ACCESS_KEY),
        ("MALIK_SHORTS_S3_SECRET_ACCESS_KEY", S3_SECRET_KEY),
        ("MALIK_SHORTS_PUBLIC_CDN_URL", PUBLIC_BASE),
    ]:
        if not value:
            missing.append(name)
    if shutil.which(FFMPEG) is None:
        missing.append(f"ffmpeg({FFMPEG})")
    if shutil.which(FFPROBE) is None:
        missing.append(f"ffprobe({FFPROBE})")
    if missing:
        raise RuntimeError("Missing media-worker runtime requirements: " + ", ".join(missing))


def worker_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {TOKEN}",
        "X-Worker-Id": WORKER_ID,
        "Content-Type": "application/json",
        "User-Agent": "MalikShortsMediaWorker/1.0",
    }


def api_post(client: httpx.Client, payload: dict[str, Any]) -> dict[str, Any]:
    response = client.post(f"{BASE_URL}/api/shorts/workers/media", headers=worker_headers(), json=payload)
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, dict) else {}


def claim(client: httpx.Client) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    payload = api_post(client, {"action": "claim", "jobTypes": CLAIM_TYPES})
    job = payload.get("job")
    asset = payload.get("asset")
    return (job if isinstance(job, dict) else None, asset if isinstance(asset, dict) else None)


def finish(client: httpx.Client, job_id: str, success: bool, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    payload = api_post(client, {
        "action": "finish",
        "jobId": job_id,
        "success": success,
        "result": result or {},
        "error": (error or "")[:4000],
    })
    if not payload.get("ok"):
        raise RuntimeError(f"worker finish rejected for job {job_id}")


def run_json(command: list[str]) -> dict[str, Any]:
    proc = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    data = json.loads(proc.stdout or "{}")
    return data if isinstance(data, dict) else {}


def parse_fraction(value: Any) -> float | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if "/" in raw:
            left, right = raw.split("/", 1)
            denominator = float(right)
            return float(left) / denominator if denominator else None
        return float(raw)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def probe_file(path: Path, asset: dict[str, Any]) -> dict[str, Any]:
    payload = run_json([
        FFPROBE,
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path),
    ])
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    video = next((stream for stream in streams if isinstance(stream, dict) and stream.get("codec_type") == "video"), {})
    audio = next((stream for stream in streams if isinstance(stream, dict) and stream.get("codec_type") == "audio"), {})
    fmt = payload.get("format") if isinstance(payload.get("format"), dict) else {}

    duration_seconds = 0.0
    for candidate in [video.get("duration"), fmt.get("duration")]:
        try:
            duration_seconds = max(duration_seconds, float(candidate or 0))
        except (TypeError, ValueError):
            pass

    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    size = path.stat().st_size
    mime = str(asset.get("mime_type") or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    fps = parse_fraction(video.get("avg_frame_rate") or video.get("r_frame_rate"))

    return {
        "width": width,
        "height": height,
        "bytes": size,
        "durationMs": max(0, int(duration_seconds * 1000)),
        "mimeType": mime,
        "codec": str(video.get("codec_name") or ""),
        "audioCodec": str(audio.get("codec_name") or ""),
        "hasAudio": bool(audio),
        "fps": round(fps, 4) if fps is not None else None,
    }


def download_source(client: httpx.Client, asset: dict[str, Any], destination: Path) -> Path:
    source_url = str(asset.get("source_url") or "").strip()
    if not source_url.startswith(("https://", "http://")):
        raise RuntimeError("asset source_url is missing or invalid")
    with client.stream("GET", source_url, follow_redirects=True) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_bytes(1024 * 1024):
                handle.write(chunk)
    if not destination.exists() or destination.stat().st_size <= 0:
        raise RuntimeError("downloaded media is empty")
    return destination


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        region_name=S3_REGION,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def public_url(key: str) -> str:
    return f"{PUBLIC_BASE}/{quote(key, safe='/')}"


def upload(path: Path, key: str, content_type: str, cache_control: str = "public, max-age=31536000, immutable") -> str:
    s3_client().upload_file(
        str(path),
        S3_BUCKET,
        key,
        ExtraArgs={"ContentType": content_type, "CacheControl": cache_control},
    )
    return public_url(key)


def even(value: float | int) -> int:
    number = max(2, int(round(float(value))))
    return number if number % 2 == 0 else number - 1


def output_dimensions(width: int, height: int, short_edge: int) -> tuple[int, int]:
    if width <= 0 or height <= 0:
        raise RuntimeError("media has no video dimensions")
    if width <= height:
        out_width = even(short_edge)
        out_height = even(height * out_width / width)
    else:
        out_height = even(short_edge)
        out_width = even(width * out_height / height)
    return out_width, out_height


def make_thumbnail(source: Path, asset: dict[str, Any], workdir: Path) -> dict[str, Any]:
    probe = probe_file(source, asset)
    width = int(probe.get("width") or 0)
    height = int(probe.get("height") or 0)
    if width <= 0 or height <= 0:
        raise RuntimeError("thumbnail source has no decodable image/video stream")

    target_short = min(720, min(width, height))
    out_width, out_height = output_dimensions(width, height, target_short)
    poster = workdir / "poster.jpg"
    duration_ms = int(probe.get("durationMs") or 0)
    seek = min(2.0, max(0.0, duration_ms / 1000.0 * 0.1))
    command = [FFMPEG, "-y"]
    if duration_ms > 0:
        command += ["-ss", f"{seek:.3f}"]
    command += [
        "-i", str(source),
        "-frames:v", "1",
        "-vf", f"scale={out_width}:{out_height}",
        "-q:v", "2",
        str(poster),
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if not poster.exists() or poster.stat().st_size <= 0:
        raise RuntimeError("ffmpeg produced no poster")

    asset_id = str(asset.get("id") or "").strip()
    if not asset_id:
        raise RuntimeError("asset id missing")
    key = f"shorts/renditions/{asset_id}/poster.jpg"
    url = upload(poster, key, "image/jpeg")
    return {"storageKey": key, "publicUrl": url, "width": out_width, "height": out_height}


def transcode_hls(source: Path, asset: dict[str, Any], workdir: Path) -> dict[str, Any]:
    probe = probe_file(source, asset)
    source_width = int(probe.get("width") or 0)
    source_height = int(probe.get("height") or 0)
    if source_width <= 0 or source_height <= 0:
        raise RuntimeError("transcode source has no decodable video stream")

    source_short = min(source_width, source_height)
    targets = [value for value in (360, 540, 720, 1080) if value <= source_short]
    if not targets:
        targets = [max(144, even(source_short))]

    asset_id = str(asset.get("id") or "").strip()
    if not asset_id:
        raise RuntimeError("asset id missing")
    base_key = f"shorts/renditions/{asset_id}/hls"
    variants: list[dict[str, Any]] = []
    master_lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"]

    for target in targets:
        bitrate = BITRATES.get(target, max(500, int(target * 4)))
        out_width, out_height = output_dimensions(source_width, source_height, target)
        variant_name = f"v{target}"
        variant_dir = workdir / variant_name
        variant_dir.mkdir(parents=True, exist_ok=True)
        playlist = variant_dir / "index.m3u8"
        segment_pattern = variant_dir / "seg_%05d.ts"

        command = [
            FFMPEG, "-y",
            "-i", str(source),
            "-map", "0:v:0",
            "-map", "0:a?",
            "-vf", f"scale={out_width}:{out_height}",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-profile:v", "high",
            "-pix_fmt", "yuv420p",
            "-crf", "21",
            "-maxrate", f"{bitrate}k",
            "-bufsize", f"{bitrate * 2}k",
            "-g", "60",
            "-keyint_min", "60",
            "-sc_threshold", "0",
            "-c:a", "aac",
            "-b:a", "128k",
            "-ac", "2",
            "-ar", "48000",
            "-f", "hls",
            "-hls_time", "4",
            "-hls_playlist_type", "vod",
            "-hls_flags", "independent_segments",
            "-hls_segment_filename", str(segment_pattern),
            str(playlist),
        ]
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if not playlist.exists():
            raise RuntimeError(f"ffmpeg produced no HLS playlist for {target}")

        variant_prefix = f"{base_key}/{variant_name}"
        for file in sorted(variant_dir.iterdir()):
            if not file.is_file():
                continue
            if file.suffix == ".ts":
                content_type = "video/mp2t"
            elif file.suffix == ".m3u8":
                content_type = "application/vnd.apple.mpegurl"
            else:
                continue
            upload(file, f"{variant_prefix}/{file.name}", content_type)

        playlist_key = f"{variant_prefix}/index.m3u8"
        playlist_url = public_url(playlist_key)
        bandwidth = (bitrate + 128) * 1000
        master_lines.append(f'#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},AVERAGE-BANDWIDTH={int(bandwidth * 0.9)},RESOLUTION={out_width}x{out_height},CODECS="avc1.64001f,mp4a.40.2"')
        master_lines.append(f"{variant_name}/index.m3u8")
        variants.append({
            "storageKey": playlist_key,
            "publicUrl": playlist_url,
            "width": out_width,
            "height": out_height,
            "bitrateKbps": bitrate,
            "codec": "h264+aac",
        })

    master = workdir / "master.m3u8"
    master.write_text("\n".join(master_lines) + "\n", encoding="utf-8")
    master_key = f"{base_key}/master.m3u8"
    master_url = upload(master, master_key, "application/vnd.apple.mpegurl", "public, max-age=300")
    return {"masterKey": master_key, "masterUrl": master_url, "variants": variants}


def process_job(client: httpx.Client, job: dict[str, Any], asset: dict[str, Any]) -> dict[str, Any]:
    job_type = str(job.get("job_type") or "")
    asset_id = str(asset.get("id") or "")
    suffix = Path(str(asset.get("storage_key") or "media.bin")).suffix or ".bin"
    with tempfile.TemporaryDirectory(prefix=f"malik-shorts-{asset_id[:8]}-") as temp:
        workdir = Path(temp)
        source = download_source(client, asset, workdir / f"source{suffix}")
        if job_type == "probe":
            return probe_file(source, asset)
        if job_type == "thumbnail":
            return make_thumbnail(source, asset, workdir)
        if job_type == "transcode_hls":
            return transcode_hls(source, asset, workdir)
        raise RuntimeError(f"unsupported job type for ffmpeg worker: {job_type}")


def main() -> None:
    require_runtime()
    print(f"[Malik Shorts] media worker online id={WORKER_ID} base={BASE_URL} jobs={','.join(CLAIM_TYPES)}", flush=True)
    with httpx.Client(timeout=httpx.Timeout(HTTP_TIMEOUT, connect=20.0), follow_redirects=True) as client:
        while True:
            try:
                job, asset = claim(client)
                if not job:
                    time.sleep(POLL_SECONDS)
                    continue
                job_id = str(job.get("id") or "")
                job_type = str(job.get("job_type") or "")
                if not asset:
                    finish(client, job_id, False, error="asset not found")
                    continue
                print(f"[Malik Shorts] processing job={job_id} type={job_type} asset={asset.get('id')}", flush=True)
                try:
                    result = process_job(client, job, asset)
                    finish(client, job_id, True, result=result)
                    print(f"[Malik Shorts] completed job={job_id} type={job_type}", flush=True)
                except Exception as exc:
                    message = f"{type(exc).__name__}: {exc}"
                    print(f"[Malik Shorts] failed job={job_id} type={job_type}: {message}", flush=True)
                    try:
                        finish(client, job_id, False, error=message)
                    except Exception as finish_exc:
                        print(f"[Malik Shorts] finish callback failed job={job_id}: {finish_exc}", flush=True)
            except KeyboardInterrupt:
                print("[Malik Shorts] media worker stopped", flush=True)
                return
            except Exception as exc:
                print(f"[Malik Shorts] worker loop error: {type(exc).__name__}: {exc}", flush=True)
                time.sleep(max(POLL_SECONDS, 5.0))


if __name__ == "__main__":
    main()
