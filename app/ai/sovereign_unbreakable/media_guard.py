def media_contract(prompt: str, kind: str = "video"):
    return {
        "kind": kind,
        "prompt": (prompt or "").strip()[:12000],
        "style": "cinematic, premium, high detail",
        "aspectRatio": "16:9" if kind == "video" else "1:1",
        "negativePrompt": "low quality, blurry, distorted, watermark, unreadable text",
    }
