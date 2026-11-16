# MalikLLM Flash production verification

## Release status

MalikLLM Flash stays available to users on the native MALIKII engines. The Google AI Mode integration is **blocked for production** and stays switched off.

### Blocker: no permitted automated access to Google AI Mode

Rechecked on 16 November 2026:

- The worker's entry `https://www.google.com/ai` redirects to `/search?udm=50&aep=11`. The general group (`User-agent: *`) of Google's [robots.txt](https://www.google.com/robots.txt) disallows `/search`. `Allow: /search` is granted only to the `facebookexternalhit` and `Twitterbot` crawlers for shared image links. No rule allows `/search?udm=50`, `/ai` or `/aimode` for other agents.
- Google [terms](https://policies.google.com/terms?hl=en-US) prohibit automated access that violates those machine-readable instructions. A signed-in Google profile does not establish permission to automate the endpoint.
- No official Google AI Mode API was found. Google's Connected Apps preview places third-party apps inside AI Mode; it does not let an app query AI Mode. Third-party "AI Mode API" services scrape the same endpoint and do not remove the restriction.
- The worker checks robots.txt before opening Chrome and fails closed with `GOOGLE_AUTOMATION_RESTRICTED`. This check was kept unchanged.

### Gemini with Google Search

The official [Gemini with Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search) text path uses the server's existing Gemini keys when `MALIK_FLASH_GOOGLE_SEARCH=1`. On 16 November, production reported the switch enabled. Render logs showed HTTP 404 for inaccessible Gemini 2.5 model IDs and HTTP 402 billing refusals from the configured connections. A grounded production answer has yet to be verified. The browser flags stay off.

- The chat publishes a Google Search reply only after receiving a completion receipt and valid grounding links. It labels successful text `google-gemini-search` and uses the reported Gemini model version.
- The path handles search and text questions that need the web. Code, sites, games, petroleum, skills, images, video and attachments use their existing routes. A bounded excerpt of the active chat accompanies the question. With context disabled, the request contains only the current question.
- The Gemini path allows three concurrent calls per app process. Each outbound generation request counts against the local daily limit, which defaults to 500 and resets on Google's Pacific day. Google can enforce a lower quota. A quota or billing refusal pauses fresh attempts. The caller stops the Google attempt at 15 seconds.
- Ordinary Flash requests can use native answers during a Google outage. Explicit requests to use Google Search or Google AI Mode receive the corresponding service error. The app displays the error once and allows the user to retry.
- `scripts/verify-malik-flash-google-search.mjs` exercises successful grounding, missing sources, incomplete responses, consent, quota, and parallel traffic with a scripted Gemini API. Before expanding the official API route, verify eligible users, the project quota, and the required display of Google Search Suggestions and restrictions on storage under the [Gemini terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search).

[Gemini image generation and editing](https://ai.google.dev/gemini-api/docs/image-generation) is the matching option for pictures. It is not connected.

### Two switches

- `NEXT_PUBLIC_MALIK_FLASH_PREVIEW=1` lists MalikLLM Flash. Production has it on: the live `/api/ai/chat` reports `defaultModel: "malik-flash"`.
- `NEXT_PUBLIC_MALIK_FLASH_BROWSER=1` (new) turns on the Google browser integration. The worker path also needs `MALIK_FLASH_ISOLATED_WORKER=1`, `MALIK_FLASH_WORKER_URL` and `MALIK_FLASH_WORKER_SECRET`. All four are off or empty.
- While the integration is off, a Flash turn is answered by the native MAX orchestrator on the stream route, the JSON route, the photo routes and the rescue path. Every native engine entry maps `malik-flash` to `malik-max`, so requests that name no model also work while Flash is the default. The chat keeps `selectedModelId: "malik-flash"`. Each answer keeps its real provider and model. Images report the engine that made them.
- Without this switch, the earlier head of this branch would have answered every production Flash turn with `FLASH_WORKER_NOT_READY` once merged, because production has the preview on and no worker. The browser and the server read the same flag, so the client never sends a worker-shaped request to the native engine.
- The Render workspace contains `MalikAI-V6.5-TITAN` and no separate worker. Live deployment before this work: `dep-dbs9knd6e07s73981tmg` at `aadbaca767c270729ea9b5f1c932c6095d7772f5`. The public health route responded `online`.
- Google's [image help](https://support.google.com/websearch/answer/16649374) lists a signed-in eligible account, availability for people 18 and older, and account-level usage limits. These apply only if access becomes permitted.

## Application and worker contract

- `NEXT_PUBLIC_MALIK_FLASH_BROWSER=0` and `MALIK_FLASH_ISOLATED_WORKER=0` are the safe defaults. `NEXT_PUBLIC_MALIK_FLASH_PREVIEW` only lists the model. The server uses `MALIK_FLASH_WORKER_URL` with the `/v1/ask` path and a backend-only `MALIK_FLASH_WORKER_SECRET` of at least 24 characters. Production requests require HTTPS and reject redirects. No Google credentials or browser URLs are returned to the app or UI.
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
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs --test scripts/verify-malik-flash-preview.mjs scripts/verify-malik-flash-image.mjs scripts/verify-malik-flash-history.mjs scripts/verify-malik-flash-google-search.mjs
npm run test:release-core
npm run typecheck
npm run build
```

Worker exchanges record queue, browser preparation, submit, first-content and completion times. Authenticated `GET /metrics` reports P50/P95 for up to 200 recent samples per task from the current process. The UI records submission-to-first-frame acknowledgment as the `malik-flash:acknowledgment` Performance entry. Google P50/P95 remain unmeasured: no permitted worker exists. Local fixture durations are not Google latency.

### Production latency of Flash on the native engine

Measured 15 November 2026 against `https://malikaiworld.world/api/stream` as a guest, Flash selected, a new chat per turn, eight short prompts. Times are client-side from send. Response headers stand in for queue admission; the server does not report its queue separately on this path.

| Stage | Samples | P50 | P95 |
|---|---|---|---|
| Response headers (admission) | 8 | 516 ms | 1 307 ms |
| First answer text | 8 | 679 ms | 11 497 ms |
| Text complete | 8 | 707 ms | 11 498 ms |

All eight turns answered with `selectedModelId: "malik-flash"`. Providers: `local-smart` (2), `groq` `openai/gpt-oss-120b` (4), `google-direct` `gemini-3.5-flash` (2). The two slow turns were the Gemini ones (7.3 s and 11.5 s to first text). Image completion was not measured.

## 16 November production follow-up

Render service `MalikAI-V6.5-TITAN` made `dep-dbt93j67bikc73ddvhr0` live at 10:20 Almaty time (05:20 UTC) with commit `1b9f2361db2f394b277f82a6253f2a3d563ea930`. [PR #173](https://github.com/anonnommalik79-lang/Malik-AI-TITAN/pull/173) contains the routing and request limit changes. The follow-up commit fixes the chat client reading HTTP error bodies twice.

- Guest Flash returned `Hello! How can I help you today?` in the desktop chat. The response stayed in the same chat after refresh. The UI reported 1.8 seconds for that turn.
- Three live requests explicitly naming Google AI Mode returned `FLASH_GOOGLE_AI_MODE_UNAVAILABLE` on the text stream, JSON chat and native image entry points. Desktop «Перегенерировать» displayed the service message in the chat after the client fix.
- The separate Gemini with Google Search request returned `FLASH_GOOGLE_SEARCH_BILLING_REQUIRED`. `/api/health` recorded `unavailable`, with upstream HTTP statuses 404 and 402. This is evidence of correct failure handling. The browser path and its image operations are blocked.
- The application and worker Flash fixtures passed 28/28 and 18/18. The Gemini engine regression passed 29/29. The full release regression and production build passed on the PR's Node 22 workflow. TypeScript, the production build, and the 11 chat stream and 15 Flash Search checks passed locally for the client fix. The [main production check](https://github.com/anonnommalik79-lang/Malik-AI-TITAN/actions/runs/43809196463) passed on attempt 2 after an intermittent 429 polling assertion on attempt 1. Local restricted-network tests passed 12/12.
- A direct HTTP smoke test on the final deployment completed an ordinary native Flash explanation in 15.1 seconds. Five simple prompts on the preceding deployment, which used the same backend, had first-text P50 of 4.396 seconds and P95 of 5.070 seconds. These are client-side samples from the test environment.

### Acceptance

| # | Acceptance | Status | Evidence |
|---|---|---|---|
| 1 | Hello through Google AI Mode | BLOCKED | No permitted automated access (see Blocker); no worker. «Hello» with Flash on production answers natively in 0.66 s. The separate Gemini Search route returned a billing error on 16 November. |
| 2 | Follow-up in the same Google chat | BLOCKED | Same blocker. Per-chat scope reuse is covered by fixtures. |
| 3 | Analyze uploaded photo | BLOCKED | Same blocker. Byte validation and the image receipt are covered by fixtures. |
| 4 | Generate a sports-car image | BLOCKED | Same blocker for Google. Native Flash image generation was not run live in this pass. |
| 5 | Edit an uploaded photo | BLOCKED | Same blocker. Source validation is covered by fixtures. |
| 6 | Edit a generated image | BLOCKED | Same blocker. Original bytes and the parent link are covered by fixtures (`verify-malik-flash-history`). |
| 7 | History after refresh | NOT TESTED | Guest history and the visible Flash answer survived refresh on the live desktop site. Signed-in durable restoration remains unverified. |
| 8 | History after app reopening | NOT TESTED | Same limitation as #7. |
| 9 | Retrieve an older message | PASS | Bounded retrieval fixtures: an older matching turn is returned, context stays within 3 600 characters. |
| 10 | Separate two chats | PASS | Account-state and worker scope fixtures. |
| 11 | Separate two users | PASS | Owner-scoped history and private media route fixtures. Google account separation is BLOCKED with the integration. |
| 12 | Delegate substantial coding to MAX | NOT TESTED | Intent and entitlement contract pass. A live Flash coding turn needs a paid or owner account. With the integration off, every Flash turn runs on MAX under the existing quotas. |
| 13 | Fail closed when unavailable | PASS | Live text, JSON and photo requests naming Google AI Mode returned `FLASH_GOOGLE_AI_MODE_UNAVAILABLE`. The desktop chat displayed the service error after retry. |
| 14 | Report the actual image generator | PASS | Receipt fixtures. Native Flash images report their real engine. Google provenance is unverified. |
| 15 | Preserve Markdown and real citations | BLOCKED | Markdown and sources round-trip in fixtures. Live Google DOM capture is blocked. |
| 16 | iPhone and desktop | NOT TESTED | Native Flash passed the desktop Chrome smoke test. iPhone remains unverified. |
| 17 | Restart browser worker | BLOCKED | Needs a permitted Google session. The worker's drain on shutdown passes on Linux (SIGTERM) and Windows (IPC). |
| 18 | Cancel and retry | BLOCKED | Local streaming and AbortSignal checks pass. Desktop retry worked for the blocked Google request. Live cancellation against a running Google session remains blocked. |
| 19 | Honor usage and subscriptions | PASS | Existing quota regressions and the Flash MAX entitlement contract. Live plan limits unverified. |
| 20 | Collect real latency metrics | BLOCKED | Google latency measurement needs a permitted working integration. Five native simple-prompt samples on 16 November had first-text P50 4 396 ms and P95 5 070 ms. |

`MALIK_FLASH_ISOLATED_WORKER=1` and `NEXT_PUBLIC_MALIK_FLASH_BROWSER=1` must stay off until a permitted access path exists and items 1-8, 15-18 and 20 pass live. A release of the integration is complete only after live text, image understanding, generation, editing, isolation, restoration and the post-deploy smoke tests succeed.
