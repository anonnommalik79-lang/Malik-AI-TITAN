# MalikVideo Worker

Production orchestration layer between Malik AI and self-hosted MiniMax H3.

## Pipeline

```text
Malik AI
  -> POST /v1/videos
MalikVideo Worker
  -> MiniMax H3 FL2VA (768px short edge + native stereo audio)
  -> durable SQLite job
  -> SeedVR2 restoration
  -> exact 1920x1080 or 2560x1440 target
  -> mux original H3 soundtrack
  -> final MP4
```

The worker deliberately refuses to pretend that a raw H3 master is 1080p/2K. If restoration is unavailable, high-resolution requests fail instead of returning a mislabeled file.

## Endpoints

- `GET /health`
- `POST /v1/videos`
- `GET /v1/videos/{id}`
- `GET /v1/videos/{id}/content`

The surface intentionally matches the H3/SGLang video API expected by Malik AI.

## Required GPU services

1. H3 FL2VA SGLang server, normally on `127.0.0.1:30010`.
2. SeedVR2 installed at `/opt/SeedVR` for 1080p/2K restoration.
3. `ffmpeg` for preserving/muxing the H3 synchronized audio track.

Official SeedVR2 guidance states that 1x H100-80G can handle 100-frame 720x1280 video while 4x H100-80G extends support to 1080p and 2K; the production default here is therefore four GPUs for the restoration stage.

## Start

```bash
cd services/malikvideo-worker
pip install -r requirements.txt
bash install-seedvr2.sh

export MALIKVIDEO_UPSTREAM_H3_URL=http://127.0.0.1:30010
export MALIKVIDEO_WORKER_API_KEY='CHANGE-ME'
export MALIKVIDEO_ENHANCER=seedvr2
export MALIKVIDEO_SEEDVR_GPUS=4

uvicorn app:app --host 0.0.0.0 --port 8010
```

## Health

```bash
curl http://127.0.0.1:8010/health
```

A full production response should include:

```json
{
  "ok": true,
  "enhancer": "seedvr2",
  "seedvr_ready": true,
  "supported_outputs": ["raw768", "1080p", "2k"]
}
```

## Malik AI environment

Only after health and an end-to-end smoke test pass:

```env
MALIKVIDEO_H3_ENABLED=true
MALIKVIDEO_H3_MODE=worker
MALIKVIDEO_H3_BASE_URL=https://YOUR-REAL-WORKER
MALIKVIDEO_H3_API_KEY=THE-SAME-PRIVATE-TOKEN
VIDEO_PROVIDER_ORDER=h3,dashscope,pollo,runway,fal,luma,veo
```

## Durability

Jobs are stored in `/data/malikvideo/jobs.sqlite3` with SQLite WAL mode. The worker resumes queued/generating/source-ready jobs after a process restart. Final files live under `/data/malikvideo/<job-id>/`.

For real production, mount `/data/malikvideo` to persistent volume storage. Do not put model weights or generated videos on the Malik AI web server.

## Manual actions that cannot be automated from the repository

- obtain/provision GPU capacity or startup credits;
- expose a secure HTTPS endpoint/network route to the worker;
- create the private worker token in your host's secret manager;
- accept licenses/terms required by the underlying model providers;
- set production environment variables in Render/Vercel/your GPU host.
