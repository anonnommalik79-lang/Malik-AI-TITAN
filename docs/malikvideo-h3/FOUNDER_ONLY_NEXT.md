# MalikVideo 1080p/2K — only founder actions left

Everything software-side is prepared in the repository. Do not enable production H3 until the final launch gate passes.

## 1. When GPU credits arrive, create the real GPU hosts

Create an H3 generation host with one of the validated repository profiles:

- `h200x4` for 4x H200
- `h100x4` for 4x H100 80GB
- `rtx5090x2` only as the slower/offload budget profile

Create a separate restoration GPU host for SeedVR2. Keeping H3 and restoration separate prevents both heavy models from competing for the same VRAM.

Do not upload H3 weights to the Malik AI web server or the founder laptop.

## 2. On the servers, run the prepared commands

### H3 host

```bash
git clone https://github.com/anonnommalik79-lang/Malik-AI-TITAN.git
cd Malik-AI-TITAN
export MALIKVIDEO_H3_PROFILE=h100x4   # change only if the purchased GPU profile differs
bash scripts/malikvideo-h3/host-preflight.sh
bash scripts/malikvideo-h3/launch-fl2va.sh
```

The H3 service should become reachable on port `30010` through a private network or protected HTTPS endpoint.

### Restoration host

```bash
git clone https://github.com/anonnommalik79-lang/Malik-AI-TITAN.git
cd Malik-AI-TITAN/services/malikvideo-enhancer
bash install-seedvr2.sh
export MALIKVIDEO_ENHANCER_API_KEY='YOUR_PRIVATE_ENHANCER_SECRET'
export MALIKVIDEO_SEEDVR_GPUS=4
uvicorn app:app --host 0.0.0.0 --port 8020
```

### Worker host (CPU is enough)

Generate secrets locally once:

```bash
python3 scripts/malikvideo-h3/generate-secrets.py
```

Store them only in provider secret managers.

Start the worker:

```bash
cd services/malikvideo-worker
export MALIKVIDEO_UPSTREAM_H3_URL='https://REAL-H3-ENDPOINT'
export MALIKVIDEO_UPSTREAM_H3_API_KEY='OPTIONAL-H3-PRIVATE-SECRET'
export MALIKVIDEO_ENHANCER=remote
export MALIKVIDEO_ENHANCER_URL='https://REAL-ENHANCER-ENDPOINT'
export MALIKVIDEO_WORKER_API_KEY='YOUR_PRIVATE_WORKER_SECRET'
export MALIKVIDEO_ENHANCER_API_KEY='YOUR_PRIVATE_ENHANCER_SECRET'
uvicorn app:app --host 0.0.0.0 --port 8010
```

Persist `/data/malikvideo` so queued/completed jobs survive worker restarts.

## 3. Run one final command before production

From any Linux shell with `curl`, `jq`, `python3` and `ffprobe`:

```bash
export MALIKVIDEO_H3_BASE_URL='https://REAL-WORKER-ENDPOINT'
export MALIKVIDEO_H3_API_KEY='YOUR_PRIVATE_WORKER_SECRET'
bash scripts/malikvideo-h3/final-launch-gate.sh
```

This command performs all of the following automatically:

1. checks worker + restoration health;
2. generates a real 1080p video through H3 -> restoration -> audio remux;
3. verifies exact 1920x1080 with `ffprobe` and requires an audio stream;
4. generates a real 2K video through the same pipeline;
5. verifies exact 2560x1440 with `ffprobe` and requires an audio stream;
6. refuses to print PASS if any stage fails.

You still must open both MP4 files and visually inspect motion consistency and subjective audio sync. Automated metadata validation cannot judge whether hands, faces, wheels or motion look good.

## 4. Only after PASS, enable Malik AI

Set these values in the Malik AI production environment:

```env
MALIKVIDEO_H3_ENABLED=true
MALIKVIDEO_H3_MODE=worker
MALIKVIDEO_H3_BASE_URL=https://REAL-WORKER-ENDPOINT
MALIKVIDEO_H3_API_KEY=YOUR_PRIVATE_WORKER_SECRET
VIDEO_PROVIDER_ORDER=h3,dashscope,pollo,runway,fal,luma,veo
```

Redeploy the web app and generate one final video from the Malik AI UI.

## Do not do these things

- Do not put a placeholder URL in production.
- Do not commit secrets to GitHub.
- Do not call a 768p H3 master “1080p” or “2K”.
- Do not enable H3 before both final MP4 validations pass.
- Do not leave paid/credit GPU machines running idle after testing.

## Definition of done

MalikVideo 1.0 is launch-ready only when `final-launch-gate.sh` prints `MALIKVIDEO PRODUCTION GATE: PASS`, both files pass visual inspection, Malik AI returns the H3 provider result, and the existing fallback provider still works when H3 is intentionally disabled.
