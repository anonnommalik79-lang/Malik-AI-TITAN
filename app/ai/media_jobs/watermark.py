"""Legacy Flask adapter for the same server-side MALIK AI pixel signature.

The alpha mask is rendered from malik-watermark.ts's outlined wordmark. No
system fonts or text added to the user's generation prompt are involved.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

VERSION = "malik-ai-wordmark-v1"
XMP = f'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:malik="https://malikaiworld.world/ns/image/1.0/" malik:watermark="{VERSION}"/></rdf:RDF></x:xmpmeta>'.encode()
MASK = Path(__file__).with_name("malik-wordmark.png")


class ImageWatermarkError(ValueError):
    code = "IMAGE_WATERMARK_FAILED"


def watermark_image_bytes(content: bytes) -> tuple[bytes, str]:
    try:
        return _watermark_image_bytes(content)
    except Exception as exc:
        raise ImageWatermarkError("IMAGE_WATERMARK_FAILED: could not finalize generated image") from exc


def _watermark_image_bytes(content: bytes) -> tuple[bytes, str]:
    from PIL import Image, ImageOps, PngImagePlugin

    if not content or len(content) > 24 * 1024 * 1024:
        raise ValueError("IMAGE_WATERMARK_FAILED: invalid source size")
    with Image.open(BytesIO(content)) as source:
        fmt = source.format if source.format in {"PNG", "JPEG", "WEBP"} else "PNG"
        if source.width * source.height > 16_000_000:
            raise ValueError("IMAGE_WATERMARK_FAILED: pixel budget exceeded")
        mime = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[fmt]
        marker = str(source.info.get("malik_watermark", "")) + str(source.info.get("xmp", "")) + str(source.info.get("XML:com.adobe.xmp", ""))
        if VERSION in marker and not source.getexif().get(274):
            return content, mime
        image = ImageOps.exif_transpose(source).convert("RGBA")
    width, height = image.size
    rounding = lambda number: int(number + 0.5)
    margin_x, margin_y = rounding(width * .025), rounding(height * .025)
    mark_width = max(1, min(width - 2 * margin_x, rounding(min(width, height) * .026 * 7.1)))
    mark_height = max(1, rounding(mark_width / 7.1))
    left, top = width - margin_x - mark_width, height - margin_y - mark_height
    sample = image.crop((left, top, left + mark_width, top + mark_height)).resize((24, 8))
    white = Image.new("RGBA", sample.size, "white")
    white.alpha_composite(sample)
    def linear(value):
        value /= 255
        return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
    luminance = sum(.2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b) for r, g, b in white.convert("RGB").getdata()) / 192
    color = (0, 0, 0) if luminance > .179 else (255, 255, 255)
    with Image.open(MASK) as wordmark:
        alpha = wordmark.getchannel("A").resize((mark_width, mark_height), Image.Resampling.LANCZOS)
    stamp = Image.new("RGBA", alpha.size, color + (0,))
    stamp.putalpha(alpha)
    image.alpha_composite(stamp, (left, top))
    target = BytesIO()
    if fmt == "PNG":
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("malik_watermark", VERSION)
        metadata.add_itxt("XML:com.adobe.xmp", XMP.decode())
        image.save(target, format=fmt, pnginfo=metadata)
    elif fmt == "JPEG":
        image.convert("RGB").save(target, format=fmt, quality=95, subsampling=0, xmp=XMP)
    else:
        image.save(target, format=fmt, quality=96, method=2, xmp=XMP)
    return target.getvalue(), mime
