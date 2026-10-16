# Founder conversation history — 2026-10-16

## Root cause

WorkOS supplies accounts, not chat content. The founder UI already had request/reply views, but `appendFounderMessage` refused writes without S3 configuration while the API misleadingly reported `runtime-memory`. There was no memory fallback. Consequently an account list could be populated while message history was empty.

Two additional bugs: first-time `pending` records were skipped during deduplication, and audit SSE parsing ignored authoritative `done.finalContent`, potentially keeping a draft instead of the answer shown to the user.

## Changes

- AES-256-GCM server-file storage when cloud storage is absent, using `FOUNDER_HISTORY_SECRET` or `WORKOS_COOKIE_PASSWORD` (at least 32 characters). Hashed user directories, sanitized request IDs, private permissions and atomic file replacement. Files are outside `public/`; invalid/public/root paths are rejected.
- Private S3/R2 configuration also recognizes the existing `PRIVATE_STATE_*` settings. One encrypted object per request; legacy objects remain readable. Existing local records remain readable when S3 is enabled on the same host; this is NOT a durable migration.
- Explicit `unavailable`, `encrypted-runtime-filesystem`, `encrypted-directory`, `encrypted-object-storage` modes. Configuration/read-back checks do not certify a disk mount or future persistence. Read failures return HTTP 503 rather than a false empty history.
- Server audit preserves the original streaming response and final answer, supports text parts, masks known credential patterns and records status/provider/model/error/time. Maximum journal text: 256,000 characters per side, with an explicit truncation flag. No new model calls.
- Private content APIs and the history page require the authenticated owner address plus verified email. A server-pinned `MALIK_OWNER_WORKOS_USER_ID` is the explicit alternative when an identity provider omits verification. Client headers/body/localStorage cannot grant content access. General account/plan behavior was not changed.
- Existing founder layouts retained. User selection, request/reply expansion and status display remain in place. Refresh now updates messages too; visible history auto-refreshes (30 seconds on the full page, 15 on the selected-user panel). Superseded requests are aborted and logout clears cached content.
- Public data-handling notice added to the existing Security page. Credential masking is best effort, not a promise that every possible secret is detected.

## How the owner checks it after deployment

1. Sign in with the configured owner account and verified email.
2. Open `/founder/history` or the existing message-history button in the founder console.
3. Send a distinctive normal chat request from a separate test account. Wait for its final answer.
4. Select that test account as owner. Expand the request: compare both texts, model and status with the test chat. Use Refresh or wait for auto-refresh.
5. Check `/api/founder/storage-health`. Without cloud: expect `durable:false`, `EPHEMERAL_WRITE_READ_OK`, not a durability claim. With cloud: expect `WRITE_READ_DECRYPT_OK`.
6. Sign in with a different account: `/api/founder/messages` and `/api/founder/activity` must return HTTP 403.

Never paste real user records, emails or credentials into a public report.

## Tests

- `node --test scripts/verify-founder-history.mjs`: real filesystem/encryption/audit/API; WorkOS identity/directory and S3 transport fixtures.
- `node scripts/verify-chat-audit-contract.mjs`: real SSE parsing with auth/storage fixtures; original wire preserved byte-for-byte.
- `node scripts/verify-founder-history-browser.mjs`: actual React views -> local HTTP -> actual message APIs -> encrypted files, desktop/mobile Chromium. Requires build CSS and Playwright. Not real-device Safari/Android or live production authentication.
- Targeted ESLint, TypeScript and production build results are reported in the task handoff, not inferred from these fixtures.

Confirmed locally: filesystem/API suite 15/15 PASS; audit wire contract 10/10 PASS; existing streaming contract 11/11 PASS; auth redirects PASS; actual founder views at 1440px and 390px 2/2 PASS. TypeScript PASS. Targeted ESLint: 0 errors, 3 React effect warnings (the existing initialization patterns remain). Auth, model and S3 fixture boundaries above still apply.

Final production build PASS (webpack, TypeScript, 84 static pages). Real local `next start` negative-access checks PASS for messages, activity, storage-health and the history page, including a spoofed admin header. These HTTP checks use dummy WorkOS configuration and no authenticated owner session. Without WorkOS configuration the existing AuthKit proxy returns HTTP 500 before the API; that is a local configuration boundary, not evidence that production registration is broken. A real production owner sign-in remains unverified.

## Boundaries / remaining operational work

- User confirmed no persistent storage is connected. Default files are ephemeral and instance-local; redeploy/replacement can erase them. A permanent private S3/R2 bucket or a verified persistent mount is required for durable, cross-instance history. Do not represent this as solved by a code commit.
- No old unsaved chat texts can be reconstructed from usage counters or WorkOS registrations.
- Server-audited routes: `/api/stream` (also called by background streaming), `/api/ai/chat`, `/api/ai/brain`, standard `/api/voice/turn`. This does not add archival of direct Gemini Live client audio/transcripts, raw attachments, anonymous guest traffic or hidden model reasoning.
- The all-account view reads the WorkOS directory and available account journals. It is not an independent directory of deleted accounts. Large-scale operation still needs an indexed, paginated audit database rather than repeated full-account scans.
- Rotating the encryption secret requires a migration/keyring; replacing it without migration makes old encrypted records unreadable.
- No production keys read or committed. No Render configuration changes or manual deployment. The user explicitly authorized commit and push to main after successful checks, including the possible Render auto-deploy; the actual pushed hash is reported in the task handoff.
