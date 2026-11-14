# MalikLLM Flash production verification

## Release status

The application and worker changes can be reviewed and run locally. The Google AI Mode integration is **blocked for production**.

- On 14 November 2026, the worker's Google address redirected from `/ai` through `/aimode` to `/search?udm=50&aep=11`. The general group in Google's [robots.txt](https://www.google.com/robots.txt) disallows `/search`, and Google [terms](https://policies.google.com/terms?hl=en-US) prohibit automated access that violates those instructions. The worker checks the policy before opening Chrome and fails closed. A signed-in Google profile alone does not establish permission to automate the endpoint.
- The Render workspace contains `MalikAI-V6.5-TITAN` and currently has no separate worker. The verified live deployment before these changes was `dep-dbs9knd6e07s73981tmg` at `aadbaca767c270729ea9b5f1c932c6095d7772f5`. The public health route responded `online`.
- Google's [image help](https://support.google.com/websearch/answer/16649374) lists a signed-in eligible account, feature availability for people 18 and older, and account-level usage limits.
- Supported alternative, subject to product approval, is a separately labeled Google integration using [Gemini with Search grounding](https://ai.google.dev/gemini-api/docs/google-search) and [Gemini image generation and editing](https://ai.google.dev/gemini-api/docs/image-generation). The official API has its own limits, identity and costs. There is no automatic switch to it.

## Application and worker contract

- `NEXT_PUBLIC_MALIK_FLASH_PREVIEW=0` and `MALIK_FLASH_ISOLATED_WORKER=0` are the safe defaults. The server uses `MALIK_FLASH_WORKER_URL` with the `/v1/ask` path and a backend-only `MALIK_FLASH_WORKER_SECRET` of at least 24 characters. Production requests require HTTPS and reject redirects. No Google credentials or browser URLs are returned to the app or UI.
- Explicit Flash selections enter the same routing policy on stream and JSON endpoints. Browser text and image failures produce retryable errors where appropriate. Software requests go through existing MAX access controls and quota admission. The image route preserves the existing image-credit checks.
- The worker accepts authenticated `GET /health` and `POST /v1/ask`. Requests carry protocol `malik-flash-worker-v1`, a correlation ID, opaque user and chat scopes, task, question and bounded attachments. The worker returns JSON or NDJSON with genuine extracted deltas and a separate terminal event. Chrome completion and generated-image markers must be confirmed against the permitted live interface before rollout.
- A single worker exposes at most four active requests, one active request per account and 30 admissions per account per hour. Idle persistent Chrome contexts close automatically. Fast shutdown and Stop close the active page; the app honors its existing durable background turn policy on ordinary network disconnect. Browser restrictions remain active.
- Flash returns Google AI Mode as the browser service and stores the generator separately from the chat selection. The Google model name remains unknown unless a verified receipt provides it. Private original media bytes and parent IDs are written to encrypted Postgres. Asset URLs verify the current MALIKII account and chat. The chat limit is 64 Flash assets, five MiB per original. Existing chat deletion tombstones immediately block access, and the account-state writer retries queued media deletion on later sync.
- Completed MALIKII turns use encrypted Postgres through the existing account-state store and optimistic compare-and-swap writes. The Flash path waits for persistence before completion. It derives bounded recent excerpts, explicitly recorded decisions or corrections, and local lexical retrieval from the durable transcript. Existing manually saved user preferences remain browser-local. Embedding retrieval, cross-device preference sync and Google profile deletion still need separate implementation and validation. Context opt-out uses an isolated browser turn and omits prior history from it.

## Verification before any activation

Run the following from the repository:

```sh
npm ci --prefix tools/malik-flash-worker
npm test --prefix tools/malik-flash-worker

cd app/templates/sovereign-hub-ui
npm ci --legacy-peer-deps
node --test scripts/verify-malik-flash-preview.mjs scripts/verify-malik-flash-image.mjs scripts/verify-malik-flash-history.mjs
npm run test:release-core
npm run typecheck
npm run build
```

The completed worker exchanges record queue, browser preparation, submit, first-content and completion times where available. Authenticated `GET /metrics` reports P50/P95 for up to 200 recent samples per task from the current process. The UI records submission-to-first-frame acknowledgment in browser Performance entries. Google P50/P95 remain unmeasured until live samples exist for each task. Local fixture durations are not Google latency.

| # | Acceptance | Status | Evidence |
|---|---|---|---|
| 1 | Hello through Google AI Mode | BLOCKED | Google automated access unavailable, no live worker. |
| 2 | Follow-up in the same Google chat | BLOCKED | Scope reuse is covered by fixtures. Live Google conversation not exercised. |
| 3 | Analyze uploaded photo | BLOCKED | Original bytes and acceptance validation covered in fixtures. |
| 4 | Generate a sports-car image | BLOCKED | No live image generated. |
| 5 | Edit an uploaded photo | BLOCKED | Source validation covered in fixtures. |
| 6 | Edit a generated image | BLOCKED | Original-byte and parent-record fixture passes. |
| 7 | History after refresh | NOT TESTED | Server-state reads were tested with a fresh module instance, full browser flow pending. |
| 8 | History after app reopening | NOT TESTED | Same limitation as #7. |
| 9 | Retrieve an older message | PASS | Local account-state and transcript retrieval fixtures. |
| 10 | Separate two chats | PASS | Account-state and worker scope fixtures. |
| 11 | Separate two users | PASS | Owner-scoped history and private media route fixtures. Google account separation still needs live verification. |
| 12 | Delegate substantial coding to MAX | NOT TESTED | Local intent and entitlement contract passed. Live MAX coding from Flash needs a paid or owner test account. |
| 13 | Fail closed when unavailable | PASS | App bridge, worker access and HTTP admission checks. |
| 14 | Report the actual image generator | PASS | Receipt and first-image lookup fixtures. Google production provenance unverified. |
| 15 | Preserve Markdown and real citations | BLOCKED | Markdown and sources round-trip in fixtures. Live DOM capture pending. |
| 16 | iPhone and desktop | NOT TESTED | Real device and responsive Flash tests pending. |
| 17 | Restart browser worker | BLOCKED | Authorized Google session restoration requires permitted access and a known conversation URL. |
| 18 | Cancel and retry | BLOCKED | Local streaming and AbortSignal checks passed. Live Google cancellation and retry remain unverified. |
| 19 | Honor usage and subscriptions | PASS | Existing quota regression and Flash MAX entitlement contract. Live plan/account limits unverified. |
| 20 | Collect real latency metrics | BLOCKED | Timing instrumentation and validation tested locally. Google P50/P95 unavailable. |

Recheck the production head, feature configuration and authorized worker readiness before any deploy. A production release is complete only after live text, image understanding, generation, editing, isolation, restoration and the post-deploy smoke tests succeed.
