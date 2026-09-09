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

MalikCoder 1.0 is the default free text/code model. It orchestrates Groq, Cloudflare Workers AI, OpenRouter Free, and SambaNova. SambaNova is best-effort: HTTP 429 puts it into a temporary cooldown while the other providers continue.

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
MALIK_CODER_OPENROUTER_MODEL=openrouter/free
MALIK_CODER_SAMBANOVA_MODEL=gpt-oss-120b
```

### Recommended output budgets

```env
MALIK_CODER_PLAN_MAX_TOKENS=1200
MALIK_CODER_PRIMARY_CHAT_TOKENS=5000
MALIK_CODER_PRIMARY_CODE_TOKENS=10000
MALIK_CODER_REVIEW_MAX_TOKENS=2200
MALIK_CODER_SPECIALIST_MAX_TOKENS=6000
MALIK_CODER_FINAL_MAX_TOKENS=16000
MALIK_CODER_CONTINUATION_MAX_TOKENS=8000
MALIK_CODER_CONTINUATION_ROUNDS=2
MALIK_CODER_PROVIDER_TIMEOUT_MS=45000
MALIK_CODER_PROVIDER_COOLDOWN_MINUTES=15
```

These values are maximum stage budgets, not a promise that every provider will emit that many tokens. Each provider can apply a smaller upstream context/output limit.

## General app environment

```env
AI_FREE_MODE=true
NEXT_PUBLIC_APP_URL=https://YOUR_APP.onrender.com
PROVIDER_TIMEOUT_MS=30000
IMAGE_FREE_MODE=true
IMAGE_PROVIDER_PRIMARY=pollinations
```

The Free text/chat allowance is **15 completed provider-backed requests per UTC day**. Internal MalikCoder planner/reviewer/fixer calls belong to the same user turn and are not counted as extra user requests.

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

`GET /api/stream` should report `defaultModel: "MalikCoder 1.0"` and `freeDailyChatRequests: 15`.

Then send one short chat request and one code request. In Render logs, MalikCoder stages may mention provider names for server diagnostics; provider names and credentials are never intentionally sent to the user-facing answer.

## Local test before deploy

```bash
npm run typecheck
npm run build
npm run start
```
