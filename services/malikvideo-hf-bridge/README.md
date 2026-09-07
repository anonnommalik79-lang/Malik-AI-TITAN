# MalikVideo 1.0 — Hugging Face H3 bridge

This CPU bridge lets the Malik AI web app use the Hugging Face ZeroGPU MiniMax H3 Space through the existing `MALIKVIDEO_H3_*` provider contract.

The UI/public model name stays **MalikVideo 1.0**. The bridge uses `ks2047/minimax-h3` by default and keeps the generated synchronized audio in the returned MP4.

## Web app environment

```env
VIDEO_PROVIDER_ORDER=h3
MALIKVIDEO_H3_ENABLED=true
MALIKVIDEO_H3_MODE=worker
MALIKVIDEO_H3_BASE_URL=https://YOUR-BRIDGE.onrender.com
MALIKVIDEO_H3_API_KEY=GENERATE_A_LONG_RANDOM_SECRET
MALIKVIDEO_H3_MODEL=MalikVideo 1.0

GUEST_DAILY_VIDEO_LIMIT=0
FREE_DAILY_VIDEO_LIMIT=1
PREMIUM_DAILY_VIDEO_LIMIT=1
MALIK_OWNER_EMAIL=YOUR_VERIFIED_WORKOS_EMAIL
```

## Bridge environment

```env
HF_TOKEN=YOUR_NEW_HF_READ_TOKEN
MALIKVIDEO_WORKER_API_KEY=THE_SAME_RANDOM_SECRET_AS_MALIKVIDEO_H3_API_KEY
MALIKVIDEO_HF_SPACE=ks2047/minimax-h3
MALIKVIDEO_HF_DURATION=5
MALIKVIDEO_HF_STEPS=20
MALIKVIDEO_HF_SEED=42
MALIKVIDEO_HF_CANVAS_16_9=1024x576 · 16:9 fast
MALIKVIDEO_HF_CANVAS_9_16=544x960 · 9:16 fast
MALIKVIDEO_HF_CANVAS_1_1=544x544 · 1:1 fast
MALIKVIDEO_HF_CANVAS_4_3=768x576 · 4:3 fast
MALIKVIDEO_DATA_DIR=/tmp/malikvideo-hf
```

## Render service

Create a Python Web Service with root directory:

```text
services/malikvideo-hf-bridge
```

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
uvicorn app:app --host 0.0.0.0 --port $PORT
```

Then put the bridge URL in the web app's `MALIKVIDEO_H3_BASE_URL`.

## Important quota distinction

`FREE_DAILY_VIDEO_LIMIT=1` is a Malik AI product limit per signed-in user. It does **not** create extra Hugging Face GPU time. Hugging Face ZeroGPU still applies its own shared daily quota to the HF account used by `HF_TOKEN`. Owner bypass is unlimited only at the Malik AI application layer; it cannot bypass the upstream HF quota.

For production scale, replace the ZeroGPU bridge with the self-hosted H3 worker/GPU path while keeping the same MalikVideo provider contract.
