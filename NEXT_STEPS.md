# NEXT STEPS — MALIK AI ULTIMATE 10

Status: **ULTIMATE 10 INCOMPLETE** (checkpoint 2026-10-24, branch `codex/ultimate10-verified-core-20261024`).

## Current implementation checkpoint
- Added Passport integration for Forge HTML/chat/publication and generated-project ZIP export; checks not actually executed remain `not_run`.
- Fixed project-builder's provider-error -> false `PASS` bug. Unavailable review is separate from a failed review and does not create a wasteful repair loop.
- Self-Build Node CLI source authoring, static diagnostics, bounded repair, external test-receipt protocol and ZIP delivery are now connected to ordinary chat. No production sandbox is configured/proved; runtime remains NOT_TESTED there.
- Added bounded claim ledger, MAX disagreement counts, existing disclosure and history restoration, and shared on-demand verification. No extra model calls or fake confidence percentages.
- 27/27 new regression scenarios PASS, including main HTTP/SSE -> real archive -> download, message restoration and on-demand verification. Recovery 21/21 and token telemetry 5/5 PASS. Production build with TypeScript passed at the integrated checkpoint; exact-final rebuild and full final release-core were not completed before the user's urgent checkpoint request. See TEST_REPORT.md for precise snapshot boundaries.
- See `docs/ultimate10/FEATURE_MATRIX.md`, `TEST_REPORT.md`, `SECURITY.md`, `DEPLOYMENT.md` for exact evidence and remaining work.

## Done and tested
- Audit and integration plan: `docs/ultimate10/ARCHITECTURE.md`.
- Proof Passport core: `lib/proof/passport.ts`. Status is derived from executed checks only; a stored PASS is recomputed. Wired into Game Studio (`lib/games/passport.ts`): passport inside the game HTML and in the chat answer; the chat preview reports the real browser run (`malik-game-booted / ready / error`).
  - `npm run test:proof-passport` — 7/7 pass; `npm run test:game-studio` — 18/18 pass; `npx tsc --noEmit` — clean.

## Not done (see the full brief in `docs/ultimate10/CODEX_PROMPT.md`)
- Production isolated Self-Build execution; static-web Self-Build preview acceptance; remaining unrelated legacy ZIP paths.
- Mission Control roles, Live Studio chat edits, Deep Research provenance/export/live acceptance, Omni Live context hand-off, Second Brain server memory, World Engine, Oil Digital Twin scenarios and their new cross-module/e2e acceptance tests.
- Reference-grade sites (3D showcase, fashion store, luxury real estate): WIP on branch `feat/site-compositions` (blueprints + 132 verified photos); it does not build yet.
- The old account/forced-research failure is already fixed in the fresh base; release-core passed it. A stale `verify-large-prompts` source assertion still expected the removed `budget - 256` cutoff; updated it to the actual budget cutoff (runtime continuation cases remain in `verify-code-completion`).
- The named Three.js Game Studio session was not found in the current app page (50 recent unpinned threads plus pinned threads); no guessed 3D runtime was imported and no other chat was messaged.
