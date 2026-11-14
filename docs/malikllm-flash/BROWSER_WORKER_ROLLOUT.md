# MalikLLM Flash / MAX PRO — staged browser preview

## Branch status

**PREVIEW ONLY, DISABLED BY DEFAULT.** This branch does not deploy a public Google AI Mode service.

- MalikLLM Flash becomes the first, free selector entry only when NEXT_PUBLIC_MALIK_FLASH_PREVIEW=1 is enabled.
- MalikLLM MAX displays the existing official Malik icon and becomes a PRO selector entry in preview mode. Subscription identifiers and billing tables are unchanged.
- Coding requests made while Flash is selected use the existing MAX engine internally. This is an explicit product policy even for free users; server quotas still apply.
- Normal chat and image-analysis requests on Flash call a per-user isolated browser worker. This is NOT the single-user local lab server.
- A stable chatId goes with each request. The worker must maintain separate Google AI Mode conversations per chat and persist the mapping.
- The answer enters the existing MALIKII Markdown/code/table/source renderer. The returned answer must be complete.

## Why the local lab cannot simply go live for everybody

The existing MALIKII_AI_Mode_Browser_Bridge listens on 127.0.0.1, retains one person's Google session, and has only one active browser conversation. Render cannot access users' local Chrome browsers. Reusing a founder's logged-in browser across accounts would leak private conversations and create serious security risks.

Google AI Mode's web interface is not an official general-purpose backend API. UI automation may be blocked, change without warning, or violate service terms. Do not circumvent CAPTCHA, anti-bot protection or login gates. A supported licensed search/vision API is strongly preferred for a public service.

## Required remote worker contract — not implemented in the local lab

- Request target: MALIK_FLASH_WORKER_URL (HTTPS).
- Authorization: Bearer MALIK_FLASH_WORKER_SECRET (backend-only secret, 24+ characters).
- POST JSON fields: protocol = malik-flash-worker-v1, userScope, chatScope, question, images.
- userScope and chatScope are opaque HMAC-derived keys from server-owned user and chat identifiers.
- Worker MUST isolate browser profiles, authentication cookies, histories and stored conversation URL by userScope. It MUST isolate individual AI Mode dialogs by chatScope. No shared logged-in Chrome account across users.
- Worker MUST handle sign-in/consent/CAPTCHA manually, without bypass.
- Image uploads: maximum 4 JPEG/PNG/WebP images (approximately 5 MB each). Worker must upload the actual content, wait for a result and confirm it processed the media.

Required successful response fields:
  answer: entire completed answer in Markdown, preserving complete code blocks
  complete: true
  imagesProcessed: true (required only for image requests)
  sources: array of {url, title} source links

If response is incomplete, an image was not processed, or service is unreachable, the backend returns an error rather than inventing a completed answer.

The worker must also provide access controls, consent, timeouts, quotas, rate limits, user-initiated logout, and delete-account handling.

## Staged rollout

1. Build and audit a permitted per-user isolated worker, or replace with a supported API.
2. Test two separate accounts and two conversations each, verify privacy and chat restoration.
3. Test long answers, full code blocks, schema/graph rendering, uploaded photos, multiple turns, rate limits and error recovery.
4. Run node --test scripts/verify-malik-flash-preview.mjs; npm run test:models; npm run typecheck; npm run build:render; then live E2E tests.
5. Configure server-only MALIK_FLASH_WORKER_URL, MALIK_FLASH_WORKER_SECRET and MALIK_FLASH_ISOLATED_WORKER=1. Only after real testing, set NEXT_PUBLIC_MALIK_FLASH_PREVIEW=1 to make Flash and MAX PRO visible.
6. Enable controlled release and rollback by disabling NEXT_PUBLIC_MALIK_FLASH_PREVIEW.

## Explicit limitations

This branch DOES NOT implement the remote worker itself or deploy it. Cloud photo reading, Chrome session persistence, Google AI Mode availability, code-completeness guarantees, billing/cost sustainability and full end-to-end tests are NOT VERIFIED. Main and production remain untouched until separately approved.
