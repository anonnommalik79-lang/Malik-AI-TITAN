from __future__ import annotations

from typing import Dict, Any

def enhance_media_prompt(prompt: str, kind: str = "video", style: str = "cinematic", aspect_ratio: str = "16:9") -> str:
    if kind == "video":
        return (
            f"{prompt}. Style: {style}. Aspect ratio: {aspect_ratio}. "
            "Smooth camera motion, strong subject continuity, cinematic lighting, clear beginning middle and ending. "
            "Avoid flicker, jitter, unreadable text and broken anatomy."
        )
    return (
        f"{prompt}. Style: {style}. Aspect ratio: {aspect_ratio}. "
        "Professional composition, clean background, sharp subject, premium lighting. "
        "Avoid blur, artifacts, watermark and unreadable text."
    )

def storyboard(prompt: str, duration: int = 5, aspect_ratio: str = "16:9") -> Dict[str, Any]:
    return {
        "title": "MALIK media storyboard",
        "prompt": prompt,
        "duration": duration,
        "aspectRatio": aspect_ratio,
        "frames": [
            {"time": "00:00", "label": "Hook", "shot": prompt[:120], "motion": "establish mood"},
            {"time": "00:02", "label": "Core", "shot": "main subject reveal", "motion": "smooth cinematic camera"},
            {"time": f"00:{str(duration).zfill(2)}", "label": "Final", "shot": "clean final frame", "motion": "stabilize"},
        ],
    }
