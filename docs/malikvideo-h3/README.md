# MalikVideo 1.0 — H3 Core

This is the first real self-hosted MalikVideo path inside Malik AI.

## Goal

Malik AI talks to our own GPU worker. The worker runs the open MiniMax H3 Base FL2VA weights. No MiniMax hosted video API is required for the base generation path.

```text
User
  -> Malik AI /api/media/video
  -> MalikVideo provider: h3
  -> our GPU worker (SGLang + MiniMax H3 Base FL2VA)
  -> 768p base video + native stereo audio
  -> Malik enhancement stage (next milestone)
  -> 1080p / 2K final MP4
```

## What is implemented now

- `h3` is a first-class Malik AI video provider.
- Text-to-video uses H3 `t2va`.
- Image-to-video uses H3 `fl2va` with the input image as the first keyframe.
- Jobs are submitted to the official SGLang-compatible `POST /v1/videos` endpoint.
- Job polling uses `GET /v1/videos/{id}`.
- Final content is proxied through Malik AI at `/api/media/video/h3-content` so the GPU worker URL and optional worker token stay private.
- H3 task IDs use the `h3:` prefix so polling can recover after a Render/serverless restart even if the in-memory job map was lost.
- Existing Wan/DashScope and other providers remain fallbacks when H3 is disabled or unavailable.

## H3 Base target

The open H3 Base pipeline renders with a 768px short edge, 24 FPS and native stereo audio. We intentionally do not pretend that changing a JSON field makes this open base model native 1080p/2K.

1080p and 2K are separate MalikVideo enhancement milestones.

## GPU worker — official H3 Base FL2VA example

Only run this on a GPU server with enough VRAM. Do not download these weights to the local development laptop.

```bash
sglang serve \
  --model-path MiniMaxAI/MiniMax-H3 \
  --num-gpus 4 \
  --ulysses-degree 4 \
  --performance-mode speed \
  --host 0.0.0.0 \
  --port 30010 \
  --model-variant fl2va
```

For a scoped manual download of only the FL2VA task family:

```bash
hf download MiniMaxAI/MiniMax-H3 \
  --include "model_index.json" "FL2VA/*" \
  --local-dir MiniMax-H3
```

The FL2VA task family is enough for MalikVideo's first Text -> Video and First-frame Image -> Video path.

## Malik AI environment

Keep H3 disabled until the worker is reachable.

```env
VIDEO_PROVIDER_ORDER=h3,dashscope,pollo,runway,fal,luma,veo
MALIKVIDEO_H3_ENABLED=false
MALIKVIDEO_H3_BASE_URL=https://YOUR-GPU-WORKER
MALIKVIDEO_H3_API_KEY=YOUR-OWN-WORKER-BEARER-TOKEN
MALIKVIDEO_H3_MODEL=MalikVideo-1.0-H3
```

After the worker is healthy:

```env
MALIKVIDEO_H3_ENABLED=true
```

`MALIKVIDEO_H3_API_KEY` protects our own worker. It is not a MiniMax API key.

## First production test

Call the same endpoint Malik AI already uses:

```bash
curl -X POST https://YOUR-MALIK-AI/api/media/video \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A black hypercar drives through a rain-soaked futuristic city at night, low tracking camera, realistic reflections and synchronized engine audio",
    "length": 5,
    "ratio": "16:9",
    "generateAudio": true
  }'
```

The response returns a `taskId`. Poll:

```text
GET /api/media/video/status?taskId=<taskId>
```

When ready, `videoUrl` points to Malik AI's protected H3 content proxy.

# Roadmap to the final quality

## Stage 1 — H3 core (implemented in this branch)

- self-hosted H3 Base
- text -> video
- image -> video
- native H3 audio
- Malik AI job routing
- private content proxy

Output target: official H3 Base class, 768px short edge.

## Stage 2 — Malik Context Engine

Build our own prompt/context compiler for Russian, Kazakh and English. It should produce a structured H3-style cinematic prompt with shot timing, camera movement, subject continuity, soundscape and dialogue while preserving the user's exact request.

## Stage 3 — 1080p enhancement worker

Use an open video-super-resolution/restoration model as a second GPU service. Initial candidates:

- FlashVSR v1.1 for fast temporally consistent video super-resolution.
- SeedVR2 for a heavier quality-first restoration route.

The enhancement worker must preserve temporal consistency; frame-by-frame image upscaling is not acceptable for the flagship path.

Output target: stable 1920x1080 MP4 with the original synchronized H3 audio remuxed unchanged.

## Stage 4 — 2K Ultra

Add a quality-first 2560x1440 pipeline after 1080p is stable. The UI should expose 2K only after moving-object consistency, faces, wheels, text and reflections pass regression tests.

## Stage 5 — MalikVideo fine-tune

Fine-tune/LoRA the open H3 derivative for MalikVideo-specific strengths. Keep provenance and licensing attribution required by the MiniMax H3 license.

## Final architecture

```text
Prompt / Image
    |
Malik Context Engine
    |
MalikVideo H3 derivative
    |
H3 Base video + stereo audio
    |
Malik Temporal Restoration
    |
Malik 1080p / 2K Enhancement
    |
Validation + encode + audio remux
    |
Final MP4
```

The first success criterion is not "weights downloaded". It is one real 5-second H3 video generated through Malik AI end-to-end and returned by the Malik status API.
