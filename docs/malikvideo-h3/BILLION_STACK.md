# MalikVideo 1.0 — production architecture

## Goal

Deliver self-hosted MalikVideo generation without a per-video MiniMax hosted API dependency while keeping output labels honest.

## Data path

```text
User prompt (RU / KZ / EN)
        |
        v
Malik Prompt Intelligence
        |
        v
Malik AI /api/media/video
        |
        v
MalikVideo Worker :8010
        |
        +------------------------------+
        |                              |
        v                              |
H3 generation GPU pool                |
MiniMax H3 FL2VA / SGLang :30010      |
768px short edge, 24fps, native audio |
        |                              |
        v                              |
h3-master.mp4                          |
        |                              |
        +---- raw768 request ----------+--> final
        |
        v
Restoration GPU pool :8020
SeedVR2
        |
        +--> 1920x1080
        +--> 2560x1440 (2K)
        |
        v
restored video frames
        |
        v
MalikVideo Worker / ffmpeg
remux H3 synchronized audio
        |
        v
FINAL MP4
```

## Why three services

### H3 generation pool

H3 is the expensive generative stage and keeps its own large weights resident. FL2VA serves both text-to-video and first/last-frame video generation.

### MalikVideo Worker

This service is mostly orchestration and storage, not heavy inference. It owns the durable public job ID, survives web/serverless restarts, tracks stages and prevents false resolution claims.

### Restoration pool

SeedVR2 is isolated from H3 so restoration cannot unexpectedly OOM the H3 server. It can be scaled independently and turned off when no high-resolution jobs are waiting.

## Quality contracts

`raw768` means the actual open-weight H3 master.

`1080p` means a final MP4 whose restored frame target is exactly 1920x1080 for 16:9, 1080x1920 for 9:16, or 1080x1080 for square.

`2k` means 2560x1440 for 16:9, 1440x2560 for 9:16, or 1440x1440 for square.

No endpoint is allowed to return the raw H3 file while labeling it 1080p/2K.

## Audio contract

H3 creates video and synchronized audio together. Restoration operates on frames. The orchestration worker therefore remuxes audio from `h3-master.mp4` into the final restored MP4 and uses `-shortest` so tracks remain bounded to the same clip duration.

## Reliability

- web app falls back to existing video providers when H3 is disabled/unconfigured;
- worker jobs persist in SQLite WAL storage;
- worker resumes H3/source/restoration stages after restart;
- final content is proxied through Malik AI, hiding internal GPU URLs;
- H3 and enhancer endpoints can require separate bearer secrets;
- CI validates Python syntax, shell scripts, resolution dimensions and Next.js types;
- `preflight.sh` blocks placeholder URLs and missing 1080p/2K capability;
- `smoke-worker.sh` verifies the real end-to-end MP4 path.

## Scaling after first users

1. Keep the CPU orchestration worker always available.
2. Scale H3 generation workers by queue depth.
3. Scale restoration workers independently by high-resolution queue depth.
4. Move generated masters/finals from local persistent volume to object storage when traffic makes shared storage necessary.
5. Add a real queue/database before running multiple orchestration replicas; SQLite is intentionally the first single-worker production milestone, not the final global scheduler.
6. Benchmark quantization/turbo LoRAs only against the full-quality baseline; never trade quality silently.
7. Fine-tune/LoRA only after a fixed evaluation suite exists for cars, humans, faces, hands, camera motion, physics, dialogue and audio sync.

## First milestone

The first real milestone is not “the code deployed.” It is two inspected files generated through the full stack:

- `malikvideo-worker-smoke-1080p.mp4`
- `malikvideo-2k-smoke.mp4`

Only then should H3 become the primary Malik AI video provider.
