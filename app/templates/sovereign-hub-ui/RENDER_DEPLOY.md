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

## MalikCoder 1.0 — required provider secrets

MalikCoder 1.0 is the default free text/code model. It orchestrates Groq, Cloudflare Workers AI, OpenRouter, and SambaNova. SambaNova is best-effort: HTTP 429 puts it into a temporary cooldown while the other providers continue.

Add these in **Render Dashboard → your Web Service → Environment → Add Environment Variable**:

```env
GROQ_API_KEY=

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

OPENROUTER_API_KEY=

SAMBANOVA_API_KEY=
SAMBANOVA_BASE_URL=https://api.sambanova.ai/v1
```

Do not prefix any of these server secrets with `NEXT_PUBLIC_` and never commit real keys to GitHub.

### MalikCoder 1.0 model routing

```env
MALIK_CODER_GROQ_MODEL=openai/gpt-oss-120b
MALIK_CODER_CLOUDFLARE_MODEL=@cf/meta/llama-3.1-8b-instruct-fast
MALIK_CODER_OPENROUTER_MODEL=poolside/laguna-s-2.1:free
MALIK_CODER_SAMBANOVA_MODEL=gpt-oss-120b
```

OpenRouter is pinned to a specific free non-NVIDIA model instead of `openrouter/free`, because the generic free router can select NVIDIA models. If the pinned model changes upstream, update `MALIK_CODER_OPENROUTER_MODEL` in Render without changing application code.

### Recommended text/code budgets

```env
FREE_DAILY_TEXT_TOKEN_LIMIT=10000
MAX_OUTPUT_TOKENS=4000
MAX_CODE_OUTPUT_TOKENS=10000
MALIK_GOD_MAX_OUTPUT_TOKENS=4000
MALIK_MODEL_PROVIDER_TIMEOUT_MS=360000
```

The 10K setting is the Malik user-facing generated-text allowance per UTC day. Provider input tokens, retries and provider-specific rate limits are separate. Long code requests are allowed up to the provider's real capability instead of being artificially clipped to a tiny completion.

## General app environment

```env
AI_FREE_MODE=true
NEXT_PUBLIC_APP_URL=https://YOUR_APP.onrender.com
PROVIDER_TIMEOUT_MS=30000
IMAGE_FREE_MODE=true
IMAGE_PROVIDER_PRIMARY=pollinations
```

The Free text/chat allowance is **10,000 generated text tokens per UTC day**. The legacy message-count ceiling is intentionally kept out of the way; per-minute abuse protection remains active. Internal MalikCoder planner/reviewer/fixer calls belong to the same user turn.

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
GET https://YOUR_APP.onrender.com/api/stream
GET https://YOUR_APP.onrender.com/api/health
GET https://YOUR_APP.onrender.com/api/health/providers
```

`GET /api/stream` should report `defaultModel: "MalikCoder 1.0"`, `freeDailyChatRequests: null`, and `freeDailyGeneratedTextTokens: 10000`.

Then send one short chat request and one code request. In Render logs, MalikCoder stages may mention provider names for server diagnostics; provider names and credentials are never intentionally sent to the user-facing answer.

## Local test before deploy

```bash
npm run typecheck
npm run build
npm run start
```
