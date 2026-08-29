from __future__ import annotations

import os
import importlib.util
import tempfile
import threading
import time
import sys
import types
from pathlib import Path


os.environ["MALIK_MEDIA_JOB_STORE_PATH"] = os.path.join(tempfile.gettempdir(), "malik-media-job-test.json")
sys.modules.setdefault("requests", types.SimpleNamespace())


def load_module(name: str, relative_path: str):
    target = Path(__file__).resolve().parents[1] / relative_path
    spec = importlib.util.spec_from_file_location(name, target)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


providers = load_module("malik_media_providers_test", "app/ai/media_jobs/providers.py")
store = load_module("malik_media_store_test", "app/ai/media_jobs/store.py")
_strict_image_prompt = providers._strict_image_prompt
create_job = store.create_job
get_job = store.get_job
update_job = store.update_job


def main() -> None:
    job = create_job(
        "image",
        {"prompt": "/image летящая лягушка", "modelId": "flux-klein-4b"},
    )

    def finish_job() -> None:
        update_job(job["id"], status="processing", progress=18)
        update_job(
            job["id"],
            status="completed",
            progress=100,
            provider="test",
            model="flux-klein-4b",
            output={"imageUrl": "/api/storage/photos/flying-frog.png"},
        )

    threading.Thread(target=finish_job, daemon=True).start()

    status = {}
    deadline = time.time() + 2
    while time.time() < deadline:
        status = get_job(job["id"]) or {}
        if status.get("status") == "completed":
            break
        time.sleep(0.02)

    assert status["status"] == "completed"
    assert status["provider"] == "test"
    assert status["output"]["imageUrl"].endswith("flying-frog.png")

    sports_car = _strict_image_prompt("/image сгенерируй фото спорткара")
    flying_frog = _strict_image_prompt("/image летящею лягушку")
    assert "sports car" in sports_car
    assert "frog" in flying_frog
    assert "flying" in flying_frog
    assert "four-panel collage" in sports_car

    dashboard = (
        Path(__file__).resolve().parents[1]
        / "app/templates/sovereign-hub-ui/components/sovereign/dashboard.tsx"
    ).read_text(encoding="utf-8")
    assert '"/api/ai/image"' in dashboard
    assert "applyPersistentMediaPatch" in dashboard
    assert "statusUrl" in dashboard and "/api/ai/job/" in dashboard
    assert "different history or reloading the dashboard" in dashboard
    assert "does not cancel generation" in dashboard
    print("image-job verification passed")


if __name__ == "__main__":
    main()
