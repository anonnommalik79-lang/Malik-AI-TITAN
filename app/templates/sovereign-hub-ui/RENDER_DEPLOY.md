# MALIK AI — Render Deployment

Deploy only the `sovereign-hub-ui` app (this folder).

## Render settings

| Setting | Value |
|---------|-------|
| **Root Directory** | `app/templates/sovereign-hub-ui` *(if monorepo)* or repo root *(if standalone)* |
| **Environment** | Node |
| **Node version** | 22.x |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` |

Render sets `PORT` automatically. Do not hardcode port 3000 in production.

## Required environment variables

```env
AI_FREE_MODE=true
TEXT_PROVIDER_ORDER=groq,gemini,openrouter
CODE_PROVIDER_ORDER=groq,gemini,openrouter
GROQ_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...                    # optional fallback
OPENROUTER_MODEL=google/gemma-2-9b-it:free
NEXT_PUBLIC_APP_URL=https://YOUR_APP.onrender.com
PROVIDER_TIMEOUT_MS=30000
IMAGE_FREE_MODE=true
IMAGE_PROVIDER_PRIMARY=pollinations
```

## Recommended (auth + history)

```env
WORKOS_CLIENT_ID=client_...
WORKOS_API_KEY=sk_...                     # server only
WORKOS_COOKIE_PASSWORD=at-least-32-characters-long
WORKOS_REDIRECT_URI=https://YOUR_APP.onrender.com/callback
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://YOUR_APP.onrender.com/callback
MALIK_ADMIN_TOKEN=long-random-secret
```

Add the production callback URL in WorkOS Dashboard and enable Google/GitHub connections.

## Do NOT set on free-tier demo (paid APIs)

`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `STABILITY_API_KEY`, `AWS_*`, `RUNWAY_*`

## Verify after deploy

```text
GET https://YOUR_APP.onrender.com/api/health
GET https://YOUR_APP.onrender.com/api/health/providers
```

Expect `groq.configured: true` and `gemini.configured: true` when keys are set.

## Local test before deploy

```bash
npm run typecheck
npm run build
npm run start
```
