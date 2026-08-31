# MalikVideo H3 GPU deployment

This is the first production GPU layer for MalikVideo 1.0.

## What this gives us

- MiniMax H3 Base FL2VA served by our own GPU worker.
- Text-to-video + synchronized audio (`t2va`).
- First-frame image-to-video + synchronized audio (`fl2va`).
- Open-weight 768px short-edge master render.
- No MiniMax hosted API required for H3 Base inference.
- Malik AI connects through `MALIKVIDEO_H3_BASE_URL`.

The 1080p and 2K enhancement stages are deliberately separate. We do not fake 1080p/2K by changing the H3 target field.

## Recommended GPU profiles

### 4x H200

Fast/high-memory profile:

```bash
export MALIKVIDEO_H3_PROFILE=h200x4
bash scripts/malikvideo-h3/launch-fl2va.sh
```

### 4x H100 80GB

Official lossless speed-oriented topology:

```bash
export MALIKVIDEO_H3_PROFILE=h100x4
bash scripts/malikvideo-h3/launch-fl2va.sh
```

### 2x RTX 5090

Budget/offload profile. Requires very large host RAM and is slower:

```bash
export MALIKVIDEO_H3_PROFILE=rtx5090x2
bash scripts/malikvideo-h3/launch-fl2va.sh
```

## Model storage

SGLang can pull `MiniMaxAI/MiniMax-H3` directly. If downloading manually, only FL2VA is required for T2VA + first-frame I2VA:

```bash
hf download MiniMaxAI/MiniMax-H3 \
  --include "model_index.json" "FL2VA/*" \
  --local-dir /models/MiniMax-H3
```

Then:

```bash
export MALIKVIDEO_H3_MODEL_PATH=/models/MiniMax-H3
```

Do not download H3 onto the Malik AI web server or a developer laptop. Keep weights on GPU storage.

## First real generation

Once SGLang is healthy:

```bash
bash scripts/malikvideo-h3/smoke-test.sh http://127.0.0.1:30010
```

A successful run creates:

```text
malikvideo-h3-smoke.mp4
```

That file is our milestone: first self-hosted H3 MalikVideo clip.

## Connect Malik AI

Expose the GPU worker through HTTPS or a protected internal network and set the web app environment:

```env
MALIKVIDEO_H3_ENABLED=true
MALIKVIDEO_H3_BASE_URL=https://REAL-H3-GPU-ENDPOINT
MALIKVIDEO_H3_API_KEY=OPTIONAL_PRIVATE_WORKER_TOKEN
VIDEO_PROVIDER_ORDER=h3,dashscope,pollo,runway,fal,luma,veo
```

Never use a placeholder URL such as `https://наш-gpu-server`.

## Launch order

1. Provision GPU host.
2. Install/launch SGLang H3 FL2VA.
3. Run `smoke-test.sh` directly against the GPU endpoint.
4. Only after the smoke test succeeds, set `MALIKVIDEO_H3_ENABLED=true` in Malik AI.
5. Generate through Malik AI UI.
6. Add temporal 1080p restoration.
7. Add 2K enhancement.
8. Fine-tune/LoRA and publish the derivative as MalikVideo 1.0 under the H3 license requirements.

## Zero-budget strategy

For initial experiments, prioritize startup GPU credits instead of paying cash. Keep GPU machines off when not testing. Credits are not infinite compute; they are a bridge to prove one working video and then optimize the economics.
