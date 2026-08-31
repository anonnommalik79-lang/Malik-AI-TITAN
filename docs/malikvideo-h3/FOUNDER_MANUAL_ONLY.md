# MalikVideo — founder-only manual actions

Everything in this document requires account ownership, billing/credit approval, secrets, or a provider console. The repository cannot legally or technically do these steps for the founder.

## 1. Corporate email

Create a working company-domain mailbox or forwarding address such as `founder@malikaiworld.world`. It must actually receive mail before using it for GPU startup applications.

## 2. GPU credits / capacity

Apply to the GPU startup programs you choose. Do not claim spending, funding, users, revenue, or hardware you do not actually have.

For the quality-first stack, request access suitable for:

- H3 generation pool: validated high-memory multi-GPU H3 configuration, e.g. 4x H100/H200; lower-cost H3 offload profiles can be benchmarked later.
- restoration pool: quality-first SeedVR2 1080p/2K profile; official guidance supports 4x H100-80G for 1080p/2K.

Credits are temporary compute funding, not permanent free GPU.

## 3. Create private worker tokens

Generate two long random secrets in your provider secret manager:

- `MALIKVIDEO_WORKER_API_KEY`
- `MALIKVIDEO_ENHANCER_API_KEY`

Never paste real secrets into GitHub or screenshots.

## 4. Deploy GPU services

On the H3 GPU host:

```bash
export MALIKVIDEO_H3_PROFILE=h100x4
bash scripts/malikvideo-h3/launch-fl2va.sh
```

On the restoration GPU host:

```bash
cd services/malikvideo-enhancer
bash install-seedvr2.sh
export MALIKVIDEO_ENHANCER_API_KEY='SECRET'
export MALIKVIDEO_SEEDVR_GPUS=4
uvicorn app:app --host 0.0.0.0 --port 8020
```

On the orchestration worker host:

```bash
cd services/malikvideo-worker
export MALIKVIDEO_UPSTREAM_H3_URL='REAL H3 URL'
export MALIKVIDEO_ENHANCER=remote
export MALIKVIDEO_ENHANCER_URL='REAL ENHANCER URL'
export MALIKVIDEO_WORKER_API_KEY='SECRET'
export MALIKVIDEO_ENHANCER_API_KEY='SECRET'
uvicorn app:app --host 0.0.0.0 --port 8010
```

## 5. Run the real smoke test

Never enable production H3 before this succeeds:

```bash
export MALIKVIDEO_H3_BASE_URL='REAL WORKER URL'
export MALIKVIDEO_H3_API_KEY='SECRET'
bash scripts/malikvideo-h3/smoke-worker.sh "$MALIKVIDEO_H3_BASE_URL" 1080p
```

Then test 2K:

```bash
bash scripts/malikvideo-h3/smoke-worker.sh "$MALIKVIDEO_H3_BASE_URL" 2k malikvideo-2k-smoke.mp4
```

Open both MP4 files and inspect motion consistency, wheels/hands/faces, lighting, audio sync and duration.

## 6. Enable Malik AI

Only after successful MP4 tests, set in the Malik AI production environment:

```env
MALIKVIDEO_H3_ENABLED=true
MALIKVIDEO_H3_MODE=worker
MALIKVIDEO_H3_BASE_URL=https://REAL-WORKER-ENDPOINT
MALIKVIDEO_H3_API_KEY=REAL-PRIVATE-TOKEN
VIDEO_PROVIDER_ORDER=h3,dashscope,pollo,runway,fal,luma,veo
```

Then redeploy the web app.

## 7. Licensing and attribution

Before commercial production, review the current MiniMax H3 license and SeedVR2 license directly from their official repositories. Keep required attribution/branding in the product. Do not market the base architecture as trained from scratch by Malik AI.

## Definition of done

The stack is production-ready only when all are true:

- H3 worker health passes;
- restoration worker health passes;
- 1080p smoke MP4 passes visual inspection;
- 2K smoke MP4 passes visual inspection;
- native H3 audio remains synchronized after restoration;
- Malik AI generation returns `provider=h3`, final URL and the requested output resolution;
- fallback video provider still works when H3 is intentionally disabled;
- no real API key is committed to GitHub.
