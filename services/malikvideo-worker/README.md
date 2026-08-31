# MalikVideo Worker

Production orchestration layer between Malik AI, self-hosted MiniMax H3 and the restoration GPU pool.

## Pipeline

```text
Malik AI
  -> MalikVideo Worker (CPU orchestration)
      -> H3 GPU pool: MiniMax H3 FL2VA
         -> 768px-short-edge master + native stereo audio
      -> restoration GPU pool: SeedVR2
         -> 1920x1080 or 2560x1440 restored frames
      -> ffmpeg
         -> original synchronized H3 audio + restored frames
      -> final MP4
```

The generation and restoration pools are separate by default so H3 and SeedVR2 do not fight for the same VRAM. The normal `Dockerfile` is intentionally CPU-only, so orchestration does not waste paid GPU capacity.

The worker refuses to pretend that a raw H3 master is 1080p/2K. If restoration is unavailable, high-resolution requests fail instead of returning a mislabeled file.

## API

- `GET /health`
- `POST /v1/videos`
- `GET /v1/videos/{id}`
- `GET /v1/videos/{id}/content`

The surface intentionally matches the video API expected by the Malik AI H3 provider.

## Recommended CPU worker

```bash
cd services/malikvideo-worker
pip install -r requirements.txt

export MALIKVIDEO_UPSTREAM_H3_URL='https://REAL-H3-ENDPOINT'
export MALIKVIDEO_WORKER_API_KEY='WORKER-SECRET'
export MALIKVIDEO_ENHANCER=remote
export MALIKVIDEO_ENHANCER_URL='https://REAL-ENHANCER-ENDPOINT'
export MALIKVIDEO_ENHANCER_API_KEY='ENHANCER-SECRET'

uvicorn app:app --host 0.0.0.0 --port 8010
```

Container build:

```bash
docker build -t malikvideo-worker services/malikvideo-worker
```

This image needs no NVIDIA runtime.

## Health

```bash
curl http://127.0.0.1:8010/health
```

When restoration is actually ready, `supported_outputs` becomes:

```json
["raw768", "1080p", "2k"]
```

## Malik AI environment

Only after an end-to-end smoke test succeeds:

```env
MALIKVIDEO_H3_ENABLED=true
MALIKVIDEO_H3_MODE=worker
MALIKVIDEO_H3_BASE_URL=https://YOUR-REAL-WORKER
MALIKVIDEO_H3_API_KEY=THE-SAME-WORKER-SECRET
VIDEO_PROVIDER_ORDER=h3,dashscope,pollo,runway,fal,luma,veo
```

## Durability

Jobs are stored in `/data/malikvideo/jobs.sqlite3` using SQLite WAL. The worker resumes generation/restoration stages after a process restart. Final files live under `/data/malikvideo/<job-id>/`.

Mount `/data/malikvideo` to persistent storage in production. Do not store H3 weights, SeedVR weights or generated videos on the Malik AI web server.

## Optional all-in-one GPU mode

Only for a machine with enough spare VRAM for local restoration, build the explicit GPU image:

```bash
docker build -f services/malikvideo-worker/Dockerfile.gpu -t malikvideo-worker-gpu services/malikvideo-worker
```

Then install SeedVR2 and set:

```bash
bash install-seedvr2.sh
export MALIKVIDEO_ENHANCER=seedvr2
export MALIKVIDEO_SEEDVR_GPUS=4
```

Split H3/restoration pools remain the recommended quality-first topology.
