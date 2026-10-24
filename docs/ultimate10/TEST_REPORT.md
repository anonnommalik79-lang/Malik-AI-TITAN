# ULTIMATE 10 — actual test record

2026-10-24, initial base `c9c949e9`, integrated `5ed93baa`, Node v22.23.3. QA mirror on D:; no production secrets copied. User requested an immediate checkpoint commit rather than further feature work.

## Passport checkpoint

- `node --test scripts/verify-project-passports.mjs`: PASS, 5/5. Real generation pipeline with fixture model, static diagnostics, actual ZIP encoding/decoding, cross-owner denial; no live model call.
- `node --test scripts/verify-proof-passport.mjs scripts/verify-work-code.mjs scripts/verify-site-forge.mjs`: PASS, 44/44 on first implementation checkpoint. Includes actual game smoke child execution from existing code and document exports; must rerun after final changes.
- First `npm run test:release-core`: FAIL at long-code test because the initial QA copy omitted public `.env.example`. Fixed the QA mirror structure; no application/test assertion weakened.
- Full `test:release-core`: PASS at the earlier passport checkpoint. Later full run stopped on isolated test-harness dependencies after ledger integration. Updated the harness to load the real ledger, prompt extractor and token normalizer; targeted recovery rerun PASS 21/21. Final complete release-core rerun NOT_COMPLETED before requested checkpoint.
- `test:ultimate-core`: PASS 27/27 on the final feature snapshot (5 project-passport, 7 Self-Build, 12 claim-ledger, 3 actual HTTP/SSE/ZIP/restore/on-demand regressions). Model and account boundaries are fixtures, not live provider evidence.
- `test:token-telemetry`: PASS 5/5; concurrent main telemetry preserved.
- Production webpack build including TypeScript and 85 static pages: PASS on the integrated `5ed93baa` checkpoint. Two later defensive guards (intent exclusions and fail-open ledger delivery) passed regressions; exact-final production rebuild NOT_RUN before requested checkpoint.
- React ledger browser checks at 375 and 1440 px: PASS with actual component/production CSS. Fixture component testing, not full authenticated production UI acceptance.
- Lint modified production files: 0 errors, 102 warnings (predominantly existing dashboard warnings); new/core-only files: 0 errors, 0 warnings.
- First local build TypeScript worker OOM while lint also ran. Sequential retry with local memory limits PASS; no compiler checks disabled.
- Existing fact-audit suite PASS after repairing its legacy dependency loader and source-shape assertions. Long-prompt assertion updated to the actual budget guard, not weakened runtime completion coverage.

Production WorkOS/model/executor acceptance: NOT_TESTED. No claim of all systems ready.
