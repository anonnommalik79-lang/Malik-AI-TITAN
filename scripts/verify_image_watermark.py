from __future__ import annotations

import importlib.util
import io
import sys
import tempfile
import types
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("malik_watermark_test", root / "app/ai/media_jobs/watermark.py")
watermark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watermark)
sys.modules["app.ai.media_jobs.watermark"] = watermark
passed = 0
folder = Path(tempfile.mkdtemp(prefix="malik-python-watermark-"))
for width, height in [(768, 1024), (1024, 1024), (1440, 810)]:
    for color in ["black", "white"]:
        for fmt in ["PNG", "JPEG", "WEBP"]:
            source = io.BytesIO()
            Image.new("RGB", (width, height), color).save(source, format=fmt)
            data, mime = watermark.watermark_image_bytes(source.getvalue())
            target = folder / f"{width}x{height}-{color}.{fmt.lower()}"
            target.write_bytes(data)
            with Image.open(target) as saved:
                assert saved.size == (width, height) and saved.format == fmt
                corner = saved.convert("RGB").crop((int(width * .75), int(height * .9), width, height))
                low, high = corner.getextrema()[0]
                delta = high if color == "black" else 255 - low
                assert 135 <= delta <= 175, (fmt, color, delta)
            assert watermark.watermark_image_bytes(target.read_bytes())[0] == data
            passed += 1

# Import the actual legacy provider module without starting Flask or a model.
spec = importlib.util.spec_from_file_location("malik_providers_test", root / "app/ai/media_jobs/providers.py")
providers = importlib.util.module_from_spec(spec)
sys.modules.setdefault("requests", types.SimpleNamespace())
spec.loader.exec_module(providers)
providers.PHOTO_STORAGE_DIR = folder
sample = io.BytesIO()
Image.new("RGB", (640, 480), "black").save(sample, format="PNG")
url = providers._save_image_bytes(sample.getvalue(), "test")
saved = (folder / Path(url).name).read_bytes()
assert watermark.watermark_image_bytes(saved)[0] == saved
providers._cloudflare_image = lambda _: {"imageUrl": url, "url": url}
output = providers.generate_image({"prompt": "unchanged request"})
assert output["watermarked"] is True and output["imageUrl"] == url
passed += 2
class Download:
    content = sample.getvalue()
    def __enter__(self): return self
    def __exit__(self, *_): return None
    def raise_for_status(self): return None
    def iter_content(self, _): yield self.content
providers.requests.get = lambda *_, **__: Download()
providers._cloudflare_image = lambda _: {"imageUrl": "https://provider.test/raw.png", "url": "https://provider.test/raw.png"}
providers._openai_image = lambda _: (_ for _ in ()).throw(AssertionError("must not purchase another image for a stamping failure"))
remote = providers.generate_image({"prompt": "unchanged request"})
assert remote["imageUrl"] == remote["url"] == remote["resultUrl"] == remote["mediaUrl"]
assert remote["imageUrl"].startswith("/api/storage/photos/")
remote_bytes = (folder / Path(remote["imageUrl"]).name).read_bytes()
assert watermark.watermark_image_bytes(remote_bytes)[0] == remote_bytes
passed += 1
Download.content = b"broken image"
try:
    providers.generate_image({"prompt": "unchanged request"})
    raise AssertionError("corrupt remote image accepted")
except (OSError, ValueError):
    passed += 1
providers._cloudflare_image = lambda _: providers._save_image_bytes(b"broken image", "test")
try:
    providers.generate_image({"prompt": "unchanged request"})
    raise AssertionError("local stamping failure accepted")
except watermark.ImageWatermarkError:
    passed += 1
try:
    watermark.watermark_image_bytes(b"invalid")
    raise AssertionError("invalid image accepted")
except (OSError, ValueError):
    passed += 1
print(f"{passed}/{passed} PASS; actual reopened legacy files: {folder}")
