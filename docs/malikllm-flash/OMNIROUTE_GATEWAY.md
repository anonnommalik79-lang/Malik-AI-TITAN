# MalikLLM Flash: OmniRoute gateway (opt-in)

**Status:** integration code prepared on a feature branch; no production deployment and no provider credentials configured.

## Why this is a separate route

- The existing `malik-flash` chat still stores conversation history and accounts.
- Text-only Flash requests may use a separate OmniRoute process when explicitly enabled.
- Image uploads still use the existing Flash browser/media handling.
- MalikLLM MAX and its routing code are **unchanged**.
- OmniRoute is an aggregator, **not** a source of free tokens. Provider quotas and terms determine availability.

## Set up locally (Windows PowerShell)

Install Node.js 22+, then:

```powershell
npm install -g omniroute
omniroute
```

Open `http://localhost:20128`. In Dashboard → Providers connect API providers **you are authorized to use for a public service**. Recommended first candidates:

- Groq: GPT-OSS 120B (fast reasoning, subject to daily limits)
- Google Gemini Flash: everyday chat and explanations
- Cloudflare Workers AI: GLM-4.7 Flash, Gemma or Llama (within the free compute allotment)
- Z.AI free Flash endpoints only where current commercial use is allowed
- OpenCode Zen, Kilo, Qoder, Qwen and other OAuth/coding-agent plans: test only **if** their current terms explicitly permit use behind a third-party multi-user public chat. Do not repurpose individual coding-tool logins as unlimited production API accounts.

Check Dashboard → Models to see the model IDs actually available with your own credentials. Do not assume a catalog entry is currently free or enabled.

In Dashboard → Combos create a combo named exactly **`flash-zero`**. Include only approved, currently free connections/models. Enable **strict zero-cost / `freeAccessPolicy: "strict"`** and disable paid fallback. If free capacity is exhausted, return an explicit limit error — do not bill silently. You may also create `flash-zero-code`, `flash-zero-smart`, `flash-zero-vision` under the same rules.

Retrieve an OmniRoute API key from Dashboard → Endpoints (this is separate from any provider's key).

### Test a single local request

```powershell
$key = [System.Net.NetworkCredential]::new('', (Read-Host "OmniRoute API Key" -AsSecureString)).Password
$body = @{model="flash-zero";messages=@(@{role="user";content="Ответь по-русски: сколько будет 17 * 19?"});stream=$false;max_tokens=250} | ConvertTo-Json -Depth 8
$r = Invoke-RestMethod -Uri "http://localhost:20128/v1/chat/completions" -Method Post -Headers @{Authorization="Bearer $key"} -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 90
$r.choices[0].message.content
```

Correct arithmetic result: `323`. A passing example does not prove model quality or production readiness.

## Connect to hosted Malik AI

**Important:** `http://localhost:20128` works only on the machine running OmniRoute. Render cannot reach your home computer through its own `localhost`.

Deploy OmniRoute to a separate, secured, persistent HTTPS host with enough RAM (the project recommends at least ~2 GB for light Docker usage). Avoid placing the full service into the currently free Malik AI Render instance without measuring memory, storage and restart behavior. Expose only authenticated API paths, keep the admin dashboard private and configure TLS. Never expose the dashboard or provider credentials to end users.

In the Malik AI backend, set these **server-only** Render Environment Variables, then deploy *after* reviewing the branch:

```dotenv
MALIK_FLASH_OMNIROUTE_ENABLED=1
MALIK_FLASH_OMNIROUTE_URL=https://YOUR-PRIVATE-OMNIROUTE-HOST/v1
MALIK_FLASH_OMNIROUTE_API_KEY=YOUR_SERVER_SIDE_OMNIROUTE_KEY
MALIK_FLASH_OMNIROUTE_MODEL=flash-zero
```

Defaults: integration off, combo name `flash-zero`. Only HTTPS external endpoints accepted; plain HTTP permitted for localhost. The server explicitly rejects generic `auto`, `auto/fast`, `auto/smart` and other routes outside the `flash-zero` combo name family, because those could bill money.

If the existing Flash interface is hidden, `NEXT_PUBLIC_MALIK_FLASH_PREVIEW` and existing account/browser requirements must still be reviewed separately before public launch. The gateway does **not** turn on the interface itself.

## Boundaries and follow-up work

- OmniRoute client currently handles **text chat only**, streaming SSE chunks back to the existing Flash response path.
- Actual file edits, database writes, social posting, image generation, browsing and research sources require explicit tool integrations and user permissions. The gateway **cannot** claim these actions without tools.
- Chat history persistence remains the existing app's responsibility.
- No uncited fresh web results: enable a verified search tool and citations before advertising up-to-date responses.
- Measure first-token latency, completion correctness, 429/503 handling, real cost, and combined per-provider quotas on staging.
- Do not merge or deploy to production without staging tests. Restrict public access, enforce user/server quotas, audit logging (no secrets), and abuse protection.
- If the strict free pool is exhausted, the request fails instead of switching to a paid provider.
