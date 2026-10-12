# Local document intake and complete composer verification

Base: core commit `9e33b7131cc7bd7983ee8a63753d5022d568fc74`, PR #124. Working branch: `codex/malik-oil-phase2-20261012`. Algorithm receipt version: `malik-petroleum-1.1.0`. All delivery commits contain `[skip render]`; no Render or manual deployment was invoked.

## Implemented

- DOCX paragraphs and simple tables are read locally from the OOXML main part. No files are extracted onto disk; relationships, field codes, macros and embedded instructions are not executed. The selected part's CRC and byte lengths are checked.
- Exactly one table with explicit `well_id`, ISO `date` and `oil_bbl_day`/`oil_m3_day` headers is passed to the existing production validator. Unit-bearing water/gas/injection/downtime fields use the same core rules. Multiple matching, nested or merged tables are not silently combined or guessed.
- Text PDF is extracted locally through fixed `pdfinfo`/`pdftotext` arguments, stdin bytes, deadlines and output bounds. Both executables must be available. No shell command is constructed from document content; no cloud extraction fallback is used.
- Prose-only DOCX and PDF produce a deterministic extraction/audit receipt, original-file SHA-256, character/line counts and an inert bounded preview. Instruction detection is a screening heuristic, not a security certification. Prose is never turned into assumed measurements or a geological interpretation.
- Corrupt/unsupported documents produce one failed receipt in the normal streaming response. File-name, MIME, bytes, bounds and parser failures are checked before any provider/attachment fallback.
- The existing skill catalogue states whether local PDF extraction is available. No production dependency was added; CI installs Poppler only in the GitHub test runner. Render configuration is unchanged.
- Full built Home → Chat browser QA is now a reproducible local-only script, preserving existing black UI and account flows.

## Actual checks

| Check | Result |
|---|---|
| Combined core + document tests | 168/168 passed; six document tests include Unicode, true DOCX water cut = 0.4, original-byte fingerprint, inert injection text, corrupt/oversized XML/ZIP, MIME/multiple-file refusal, actual text-PDF extraction |
| Local document coverage | Lines 100%; branches 79.41%; functions 87.10%, measured V8 coverage; uncovered branches remain |
| Actual HTTP/SSE handler | CSV in four languages, DOCX table, text-PDF audit and corrupt-PDF refusal passed. Provider/media functions throw if invoked; explicit auth/quota fixtures |
| Skill HTTP handler | Six real exports, Arabic HTML, Arabic PDF refusal, owner/schema checks, throttle and existing math passed; auth/storage fixtures |
| Complete built guest interface | Passed at 1280 and 390 px: SVG, @ selection/removal, no execution before send, structured ID, single user/assistant message and no answer image. SSE network response is a fixture |
| Code checks | Targeted ESLint, TypeScript and local `next build --webpack` passed |
| Remote core CI | Dedicated petroleum workflow passed on Node 22. Existing production workflow stops at the same six baseline Markdown failures reproduced independently; it is not fully green |

Limits: 4 MB source file; DOCX at most 2,000 parts, 8 MB per declared part and 16 MB declared total; extracted text at most 1,000,000 characters. PDF requires 1–100 unencrypted pages, all extracted; scanned documents/OCR and geometric table recovery are unsupported. Parser deadlines do not establish isolated execution or enterprise penetration-test approval. A corporate pilot needs patched native parsers, retention/access policy and a security review.

Native Arabic engineering terminology review and full exported mixed-script layout validation remain outstanding. Arabic PDF export is still explicitly unavailable. Synthetic demo snapshots retain their original 1.0 receipt versions; regenerate them for a 1.1 replay rather than changing the historical evidence.

## Reproduce

```bash
cd app/templates/sovereign-hub-ui
npm run test:petroleum
npm run test:petroleum-documents
npm run test:petroleum-api
npm run test:petroleum-stream
npm run typecheck
npx next build --webpack
```

For full browser QA, run a local Next server with test-only WorkOS values, install a QA-only Playwright/Chromium runtime, then set `MALIK_QA_BASE_URL` to localhost, `MALIK_QA_PLAYWRIGHT_PATH` and optionally `MALIK_QA_CHROMIUM_PATH` before `npm run test:petroleum-full-ui`. Real customer login, deployment and model calls are outside this fixture test.

## Files changed in this delivery

- `.github/workflows/petroleum-engine-check.yml`
- `app/templates/sovereign-hub-ui/app/api/stream/route-impl.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/documents.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/engine.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/report.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/schema.ts`
- `app/templates/sovereign-hub-ui/lib/work/skills/registry.ts`
- `app/templates/sovereign-hub-ui/package.json`
- `app/templates/sovereign-hub-ui/scripts/verify-petroleum-documents.mjs`
- `app/templates/sovereign-hub-ui/scripts/verify-petroleum-full-ui.mjs`
- `app/templates/sovereign-hub-ui/scripts/verify-petroleum-stream.mjs`
- `docs/petroleum/IMPLEMENTATION.md`
- `docs/petroleum/PHASE2.md`

The full capability gaps, MENA scenarios, sources and commercial-pilot requirements are in `IMPLEMENTATION.md` and `PILOT.md`. This delivery increases supported intake and verification; it does not establish all 100 capabilities or industrial-control readiness.
