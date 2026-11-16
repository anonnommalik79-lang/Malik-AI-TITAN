# MalikLLM Flash — Google AI Mode browser readiness (16 Nov 2026)

This is a **non-production** integration checklist. The app already has a Flash browser bridge, chat history, attachment handling, image generation/editing routes, and a separate Playwright worker. This document does not claim live Google AI Mode functionality.

## Requested end-to-end behavior

1. A signed-in MALIK AI user selects `malik-flash` and submits a text question or up to four supported images.
2. The server authenticates and rate-limits the user, resolves a chat ID, and forwards a bounded request to the isolated worker over authenticated HTTPS.
3. The worker checks Google access policy **before** launching automation. If restricted, it returns `GOOGLE_AUTOMATION_RESTRICTED` and must not attempt to evade the restriction.
4. If permitted, a separately authenticated user browser session submits the question. Only verified completed answers, verified processed uploads, and genuine generated-image bytes may be returned.
5. The app persists the transcript, citations and account-scoped image assets before acknowledging completion; image generation and edits use the existing media-credit checks.
6. Errors must be surfaced without mislabeling a native-model response as Google AI Mode. Existing native Flash remains available while browser integration is disabled.

## Current configuration

- Keep `NEXT_PUBLIC_MALIK_FLASH_BROWSER=0` and `MALIK_FLASH_ISOLATED_WORKER=0` until permitted browser access and production tests are documented.
- `NEXT_PUBLIC_MALIK_FLASH_PREVIEW=1` may remain enabled: it only lists the Flash model.
- Never expose `MALIK_FLASH_WORKER_SECRET`, Google cookies, or Google credentials in client-side bundles, logs, or pull requests.
- Require `MALIK_FLASH_WORKER_URL` to point to the authenticated `/v1/ask` endpoint over HTTPS in production.

## Local verification commands

```sh
npm ci --prefix tools/malik-flash-worker
npm test --prefix tools/malik-flash-worker
cd app/templates/sovereign-hub-ui
npm ci --legacy-peer-deps
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs --test scripts/verify-malik-flash-preview.mjs scripts/verify-malik-flash-image.mjs scripts/verify-malik-flash-history.mjs scripts/verify-malik-flash-google-search.mjs
npm run typecheck
npm run build
```

## Acceptance matrix

| Case | Expected result |
| --- | --- |
| Browser integration disabled | Flash routes to the existing native engine; no worker request |
| Google automation disallowed | Explicit Google AI Mode request returns a clear unavailable error; no browser launch |
| Worker unavailable | Bounded timeout or explicit error; no false success |
| Text completion | Verified final receipt, real source links, saved user/assistant turn |
| Photo understanding | Uploaded image validated; processed-image receipt required |
| Image generation | Verified newly generated image bytes, account-scoped asset URL, saved receipt |
| Image edit | Original image verified, changed output confirmed, parent relationship stored |
| Wrong account/chat | No access to another user's transcript or images |
| Stop / cancellation | Request aborted, no partial completion receipt |
| Reload chat | Saved answer and media still accessible to their owner |

**Release gate:** do not enable the browser flags or deploy the worker until permitted automated access to the target Google interface is established, a separate worker is deployed securely, and real end-to-end acceptance tests pass. A working personal ZIP demo is not proof of production access or performance.
