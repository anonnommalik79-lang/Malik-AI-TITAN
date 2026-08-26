# MALIK AI — Media API Local Setup

Image: **Stability AI** (primary) → **Pollinations** (fallback)  
Video: **Pollo API** only (`pollo-v2-0`)  
Amazon/AWS: **disabled** for media in this phase (health reports `amazon: "disabled"`).

## 1. Create `.env.local` (never commit)

```bash
cp .env.example .env.local
```

Paste your keys **only** in `.env.local`:

```env
STABILITY_API_KEY=sk-...
POLLO_API_KEY=...

IMAGE_PROVIDER_PRIMARY=stability
IMAGE_PROVIDER_FALLBACK=pollinations
IMAGE_FREE_MODE=false

POLLO_VIDEO_MODEL=pollo-v2-0
VIDEO_PROVIDER_PRIMARY=pollo
POLLO_VIDEO_ENABLED=true

GUEST_DAILY_IMAGE_LIMIT=3
FREE_DAILY_IMAGE_LIMIT=10
PREMIUM_DAILY_IMAGE_LIMIT=50
GUEST_DAILY_VIDEO_LIMIT=0
FREE_DAILY_VIDEO_LIMIT=1
PREMIUM_DAILY_VIDEO_LIMIT=5
```

### Where to get keys

| Key | Link |
|-----|------|
| Stability | https://platform.stability.ai/account/keys |
| Pollo | https://pollo.ai/api-platform/keys |

Keys stay **server-side only**. They are never sent to the browser.

## 2. Start local server

```bash
npm install
npm run dev
```

Production-style:

```bash
npm run build && npm run start
```

## 3. Health checks

```text
GET http://localhost:3000/api/health/media-providers
GET http://localhost:3000/api/health/stability
GET http://localhost:3000/api/health/image-providers
GET http://localhost:3000/api/health/pollo
```

Expected `media-providers` shape:

```json
{
  "stability": "configured",
  "pollinations": "available",
  "pollo": "configured",
  "amazon": "disabled",
  "imageProviderPrimary": "stability",
  "videoProviderPrimary": "pollo",
  "polloVideoEnabled": true,
  "limits": { ... }
}
```

## 4. Test image generation

```bash
curl -X POST http://localhost:3000/api/media/image \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Premium AI dashboard, cinematic lighting\",\"aspectRatio\":\"16:9\",\"mode\":\"cinematic\"}"
```

UI: Dashboard → Photo Generation studio, or chat “Создай изображение…”.

## 5. Test Pollo video

Enable first:

```env
POLLO_VIDEO_ENABLED=true
POLLO_API_KEY=...
```

Create job:

```bash
curl -X POST http://localhost:3000/api/media/video \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Cinematic AI product launch, dark studio\",\"length\":5,\"resolution\":\"720p\"}"
```

Poll status:

```bash
curl "http://localhost:3000/api/media/video/status?taskId=YOUR_TASK_ID"
```

Statuses: `queued` → `processing` → `ready` (with `videoUrl`) or `failed`.

UI: Dashboard → Video Generation studio, or chat “Создай видео…”.

## 6. Local tunnel (optional)

```bash
npx localtunnel --port 3000
```

Use the tunnel URL for OAuth callbacks only. **Do not** put API keys in URLs or frontend code.

## 7. What remains placeholder

- Amazon Bedrock / AWS media: explicitly disabled (`amazon: "disabled"` in health).
- Persistent media storage (S3/R2): not wired — URLs returned directly from providers.
- Server-side usage counters reset on process restart (in-memory).
