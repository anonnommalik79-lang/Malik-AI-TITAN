# Deploy MALIK AI Sovereign Hub on Render

## Prerequisites

- Node.js 20+
- Render Web Service account
- WorkOS AuthKit project with Google and GitHub enabled
- At least one AI provider API key (Groq/Gemini/OpenRouter recommended for free mode)

## Build settings

| Setting | Value |
|---------|-------|
| Root Directory | `app/templates/sovereign-hub-ui` (if monorepo) or repo root |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Node Version | `20` |

## Required environment variables

Set these in Render → Environment:

```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-service.onrender.com
AI_FREE_MODE=true
```

Add provider keys from `.env.example` (at minimum one of `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`).

## WorkOS AuthKit

```
WORKOS_CLIENT_ID=client_...
WORKOS_API_KEY=sk_...
WORKOS_COOKIE_PASSWORD=at-least-32-characters-long
WORKOS_REDIRECT_URI=https://your-service.onrender.com/callback
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://your-service.onrender.com/callback
```

Add the same callback URL in WorkOS Dashboard and enable Google/GitHub connections.

## Upload limits

```
MAX_UPLOAD_IMAGE_MB=10
MAX_UPLOAD_VIDEO_MB=50
MAX_UPLOAD_DOC_MB=12
```

## Health checks

- `GET /api/health` — basic liveness
- `GET /api/health/providers` — AI provider readiness
- `GET /api/health/auth` — WorkOS AuthKit status

## Post-deploy verification

1. Open `/` — auth screen loads
2. Google/GitHub login → callback → `/dashboard`
3. Send a message — SSE stream returns thinking status + content
4. Check API Health popover — providers show configured/missing

## Notes

- Cold starts on Render free tier may take 30–60s for first request.
- Set `MALIK_BACKEND_PROXY_ENABLED=false` unless you run a separate backend.
- Keep `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` server-only.
