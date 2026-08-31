#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def expected_dimensions(resolution: str, ratio: str) -> tuple[int, int]:
    r = resolution.strip().lower().replace("1440p", "2k")
    if r in {"1080", "1080p", "fhd"}:
        landscape = (1920, 1080)
        square = (1080, 1080)
    elif r in {"2k", "qhd", "2560x1440"}:
        landscape = (2560, 1440)
        square = (1440, 1440)
    else:
        raise ValueError(f"unsupported resolution: {resolution}")

    ratio = ratio.strip()
    if ratio == "9:16":
        return landscape[1], landscape[0]
    if ratio == "1:1":
        return square
    if ratio != "16:9":
        raise ValueError(f"unsupported ratio: {ratio}")
    return landscape


def parse_fraction(value: str | None) -> float:
    if not value or value in {"0/0", "N/A"}:
        return 0.0
    if "/" in value:
        left, right = value.split("/", 1)
        denominator = float(right)
        return float(left) / denominator if denominator else 0.0
    return float(value)


def parse_duration(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


def probe(path: Path, ffprobe: str) -> dict[str, Any]:
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def verify(path: Path, resolution: str, ratio: str, require_audio: bool = True) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"file does not exist: {path}")
    if path.stat().st_size < 100_000:
        raise RuntimeError(f"file is suspiciously small: {path.stat().st_size} bytes")

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe is required but was not found in PATH")

    payload = probe(path, ffprobe)
    streams = payload.get("streams") or []
    videos = [s for s in streams if s.get("codec_type") == "video"]
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    if not videos:
        raise RuntimeError("final MP4 contains no video stream")
    if require_audio and not audios:
        raise RuntimeError("final MP4 contains no audio stream; MalikVideo requires synchronized H3 audio")

    video = videos[0]
    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    expected_width, expected_height = expected_dimensions(resolution, ratio)
    if (width, height) != (expected_width, expected_height):
        raise RuntimeError(
            f"resolution mismatch: got {width}x{height}, expected {expected_width}x{expected_height}"
        )

    fps = parse_fraction(video.get("avg_frame_rate") or video.get("r_frame_rate"))
    if fps <= 0:
        raise RuntimeError("video FPS is missing or invalid")

    format_duration = parse_duration((payload.get("format") or {}).get("duration"))
    video_duration = parse_duration(video.get("duration")) or format_duration
    if not video_duration or video_duration <= 0:
        raise RuntimeError("video duration is missing or invalid")

    audio_duration = None
    if audios:
        audio_duration = parse_duration(audios[0].get("duration")) or format_duration
        if audio_duration is not None and abs(audio_duration - video_duration) > 1.0:
            raise RuntimeError(
                f"audio/video duration mismatch is too large: video={video_duration:.3f}s audio={audio_duration:.3f}s"
            )

    summary = {
        "ok": True,
        "file": str(path),
        "bytes": path.stat().st_size,
        "resolution": f"{width}x{height}",
        "requested": resolution,
        "ratio": ratio,
        "fps": round(fps, 3),
        "video_duration_seconds": round(video_duration, 3),
        "audio": bool(audios),
        "audio_duration_seconds": round(audio_duration, 3) if audio_duration is not None else None,
        "video_codec": video.get("codec_name"),
        "audio_codec": audios[0].get("codec_name") if audios else None,
    }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Fail-closed validator for MalikVideo final 1080p/2K MP4 output")
    parser.add_argument("file", type=Path)
    parser.add_argument("--resolution", required=True, choices=["1080p", "2k"])
    parser.add_argument("--ratio", default="16:9", choices=["16:9", "9:16", "1:1"])
    parser.add_argument("--allow-no-audio", action="store_true")
    args = parser.parse_args()

    try:
        summary = verify(args.file, args.resolution, args.ratio, require_audio=not args.allow_no_audio)
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"PASS: real {args.resolution} MP4 contract verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
