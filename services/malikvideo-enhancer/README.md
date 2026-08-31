# MalikVideo Enhancer

Dedicated high-memory restoration service for MalikVideo 1080p and 2K delivery.

It is intentionally separate from the H3 generation server so MiniMax H3 and SeedVR2 do not compete for the same VRAM at the same time.

## API

- `GET /health`
- `POST /v1/enhance` multipart: `video`, `resolution=1080p|2k`, `ratio=16:9|9:16|1:1`, `seed`
- `GET /v1/enhance/{id}`
- `GET /v1/enhance/{id}/content`

## GPU target

The default uses SeedVR2 3B. The official SeedVR2 repository states that 4x H100-80G supports 1080p and 2K restoration, so that is the quality-first production profile. Cheaper profiles can be benchmarked later, but are not silently advertised as equivalent.

## Bootstrap

```bash
cd services/malikvideo-enhancer
pip install -r requirements.txt
bash install-seedvr2.sh

export MALIKVIDEO_ENHANCER_API_KEY='CHANGE-ME'
export MALIKVIDEO_SEEDVR_GPUS=4
uvicorn app:app --host 0.0.0.0 --port 8020
```

Then point the orchestration worker at it:

```env
MALIKVIDEO_ENHANCER=remote
MALIKVIDEO_ENHANCER_URL=https://REAL-ENHANCER-ENDPOINT
MALIKVIDEO_ENHANCER_API_KEY=CHANGE-ME
```

The enhancer restores frames only. The orchestration worker remuxes the original MiniMax H3 synchronized audio into the final restored MP4.
