# Malik Work: next generation (Claude, branch `feature/malik-work-next-generation`)

Status: core chain implemented and tested locally on 2026-10-14. **Not deployed.** Render was not used.
The oil engine was not touched (Codex area); only the shared route for oil tables stayed as it was.

## 1. Audit: what Work already had

| Area | Before this branch | Evidence |
|---|---|---|
| Task engine | OS flows: tasks with dependencies, retries with backoff, cancel, interrupted-after-restart, idempotent requests, per-account isolation | `test:os-flow` (12 checks) |
| Tools registry | 15 tools behind one contract (`lib/os/tools`), input/timeout/side-effect per tool | `test:os-core` |
| Code generation | `code.project`: Next.js project from the model; static regex QA + AI review; 1 repair | `lib/ai/project-builder.ts` |
| Preview | Static HTML only. React/Next/TypeScript projects: «нужна сборка — скачайте ZIP». The canvas preview ran generated code **with `allow-same-origin`** (it could read Malik AI storage) | `components/sovereign/os/preview.ts`, `preview-panel.tsx` |
| Export | ZIP built in the browser; DOCX/PDF/XLSX/CSV/MD/HTML documents | `test:work-docs` |
| Presentations | PPTX with native tables, charts and notes | `test:presentations` |
| Data analyst | CSV/XLSX parsing, column profiles, missing values, correlations, groups | `lib/os/data` |
| Projects | Private per-account store of projects, artifacts and versions | `test:os-library`, `test:projects` |
| Folder upload | Composer folder picker folds files into one text for the model | `chat-view.tsx` |

## 2. What this branch adds

The chain **Task → Code → Safe preview → Export → Saved project** for real code projects:

- **Project engine** (`lib/work/code/files.ts`, `zip-read.ts`):
  - Safe relative paths: no `..`, absolute or drive paths, control characters.
  - Limits: 400 files, 8 MB of code, 512 KB per file.
  - `node_modules`, `.git`, build folders and secrets (`.env*`, keys, `.npmrc`) are never read or stored.
  - The ZIP reader trusts only the central directory. It checks CRC and sizes, and caps each entry, the total and the compression ratio (zip bombs). Encrypted, multi-disk and ZIP64 archives are refused.
- **Real diagnostics** (`lib/work/code/diagnostics.ts`). Every finding has a file, line and column. They cover:
  - syntax of every TS/TSX/JS file (TypeScript parser);
  - JSON (tsconfig comments allowed);
  - every import resolved, including `@/*` aliases;
  - packages checked against package.json;
  - Next.js rules that break real builds:
    - hooks or event handlers in a Server Component, found through the import graph up to the `"use client"` boundary;
    - `metadata` exported from a client file;
    - `app/error` without `"use client"`;
    - no root layout;
    - pages without a default export;
  - unbalanced CSS and missing local files in HTML.
- **Real preview** (`lib/work/code/preview.ts`, `preview-runtime.ts`):
  - The project's own code is compiled on the server with the TypeScript compiler, then run in a sandboxed frame on a self-hosted React 18 runtime (`public/work-preview/`, no CDN).
  - The Next.js App Router renders every page with its layout chain.
  - Stand-ins are provided for `next/link`, `next/image`, `next/navigation`, `next/font`, `next/dynamic`, `lucide-react` and `clsx`.
  - Internal navigation, async Server Components and `metadata.title` work.
  - React/Vite runs `src/main`; static sites are inlined.
  - «Ready» is sent only after React has really rendered.
  - Errors come back with the file they happened in.
  - A frame that does not answer within 8 s is a failure, not an endless spinner.
- **Security of previews**:
  - The frame runs **without same-origin**: no Malik AI cookies, storage or parent access. Checked live.
  - CSP blocks every network request (`connect-src 'none'`), forms and frames.
  - Generated apps get an in-memory localStorage instead.
  - The same fix was applied to the existing canvas preview (`allow-same-origin` removed).
- **Honest status** (`lib/work/code/status.ts`):
  - **COMPLETED_VERIFIED** only when there are no errors and no warnings and the preview really rendered.
  - **COMPLETED_WITH_LIMITATIONS**, **FAILED**, **BLOCKED** and **CANCELLED** cover everything else.
  - **CHECKING** is never shown as done.
- **API** `POST /api/work/code` (`analyze` | `preview` | `unzip` | `save`):
  - The owner comes from the session; the body is capped at 14 MB; requests are rate-limited.
  - Guests can check and preview; saving needs an account.
  - Saving goes to that account's private store with versions (`revision-of`). A foreign `revisionOf` starts the caller's own project.
- **Work Code Studio** (`components/sovereign/work-code/`), opened by the «Код и превью» button in Work:
  - Upload: drag-and-drop of a folder, files or a ZIP; a folder picker; a file picker.
  - Code: a file tree, a code viewer with line numbers and marked error lines.
  - Problems: clicking a problem opens the file at its line.
  - Preview: desktop / phone (390 px) / refresh, plus a page indicator.
  - Actions: ZIP export, «Сохранить в проекты».
  - Generated code artifacts now open in the same studio, with «Исправить с AI» wired to the existing edit flow.
  - Languages: RU/EN/KK/AR, with RTL for Arabic.
- **Self-repair in generation** (`lib/ai/project-builder.ts`):
  - The real compiler diagnostics join the QA.
  - Up to 2 repairs, each with the exact file:line messages.
  - A second repair happens only if the first one reduced the problems; otherwise the result is FAILED, with the issues.

## 3. 30-test acceptance suite

| # | Scenario | Status | Evidence / limitation |
|---|---|---|---|
| 01 | Simple site | PARTIAL | Preview and checks of a site: `test:work-code-live`. Generation itself uses a model, which was not run (no paid calls) |
| 02 | React app | PARTIAL | React/Vite preview: `test:work-code`. Generation with a live model not run |
| 03 | Responsive dashboard | PARTIAL | Phone/desktop preview verified; no dashboard generation run |
| 04 | Multi-file project | VERIFIED | 10-file Next.js project: diagnostics, preview, ZIP |
| 05 | View source | VERIFIED | Live: tree, viewer, line numbers |
| 06 | Working preview | VERIFIED | Live: page, client state, localStorage, link navigation |
| 07 | Mobile preview | VERIFIED | Live: 390 px frame; the studio fills a 390 px screen |
| 08 | Build error detection | VERIFIED | Syntax, imports, dependencies, Next.js server/client rules with file:line. `next build` itself is not run on user projects |
| 09 | Fix a project error | VERIFIED (generation) | Self-repair test with fixture model: 2 rounds, exact diagnostics in the prompt. «Исправить с AI» in the artifact viewer: wiring only, not live-tested (needs an account) |
| 10 | Export sources | VERIFIED | ZIP reads back to identical files; live download checked |
| 11 | DOCX | VERIFIED | Heading, native table |
| 12 | PDF | VERIFIED | Real PDF, 2+ pages, title, page numbers in the builder |
| 13 | PDF structure | VERIFIED | Loaded with pdf-lib |
| 14 | PPTX | VERIFIED | Existing `test:presentations` |
| 15 | Editable slides | VERIFIED | Native text/tables/charts in slide XML (`test:presentations`) |
| 16 | CSV analysis | VERIFIED | Exact mean/median/sum/missing |
| 17 | XLSX analysis | VERIFIED | XLSX round-trip read |
| 18 | Missing values | VERIFIED | Counted; empty columns get no invented numbers |
| 19 | Correct charts | PARTIAL | Visual Engine tests exist (`test:visual-engine`); Work dashboard charts not re-verified here |
| 20 | Export analysis | VERIFIED | XLSX/CSV export |
| 21 | Save project | VERIFIED | Real store (memory backend) |
| 22 | Restore project | PARTIAL | Saved artifact is read back; reopening in the UI needs an account, not live-tested |
| 23 | File authorization | VERIFIED | Another account gets null |
| 24 | Foreign projects | VERIFIED | Plus existing `test:os-flow` |
| 25 | Cancel task | VERIFIED | Existing `test:os-flow` |
| 26 | Timeout recovery | PARTIAL | Preview 8 s timeout → FAILED (code path; not forced in a live test); OS flow retries exist |
| 27 | Error reporting | VERIFIED | Diagnostics and runtime errors from the frame shown with their source |
| 28 | Arabic interface | PARTIAL | Code Studio is RTL in Arabic (live). The rest of the Work UI is Russian-only |
| 29 | Mobile Work interface | VERIFIED | Studio at 390 px, no horizontal scroll |
| 30 | Existing features keep working | VERIFIED | All 48 `test:release-core` suites, 16 Work/OS suites, `npm run build` passed |

## 4. Malik Work vs GPT Work: capability acceptance matrix

This compares measurable capabilities only. **No claim of parity is made.**

| Capability | Malik Work now | Status |
|---|---|---|
| Multi-file upload | Picker and drag-and-drop, limits, skipped files listed | VERIFIED |
| Full folder upload | Folder picker and dropped folders, structure kept | VERIFIED |
| Project analysis | Stack, entries, file:line diagnostics | VERIFIED (static) |
| Code generation | `code.project` with compiler-checked QA | PARTIAL (live model not run here) |
| Code editing | AI edit of artifacts exists; no in-browser editor | PARTIAL |
| Error correction | Self-repair with real diagnostics; «Исправить с AI» | PARTIAL |
| Website creation | `site.generate`, `code.project` | PARTIAL |
| Real website preview | Next.js App Router, React/Vite, static, sandboxed | VERIFIED |
| Document generation | DOCX/PDF/XLSX/CSV/MD/HTML | VERIFIED |
| PDF export | Real PDF with fonts and page numbers | VERIFIED |
| PowerPoint | PPTX with native elements | VERIFIED |
| Spreadsheet analysis | CSV/XLSX profiling | VERIFIED |
| Charts | Visual Engine | PARTIAL here |
| Project persistence | Private store with versions | VERIFIED |
| Multi-step tasks | OS flows | VERIFIED (existing) |
| Long-task recovery | Interrupted flows continue; retries | VERIFIED (existing) |
| Tool transparency | Real statuses; no fake «готово» | VERIFIED |
| User permissions | Session-derived owner; sign-in for saving | VERIFIED |
| Secure artifact delivery | Sandbox without same-origin; CSP; secret filtering | VERIFIED |
| Mobile usability | Studio fits 390 px | VERIFIED |

## 5. Not done yet (exact next steps)

1. **Server-side `npm install && next build` in an isolated sandbox.** It is not possible on the current Render web service without a separate job runner. The preview runs in the browser, and API routes, server actions and SSR are labelled as not executed.
2. **Pages Router, Tailwind compilation, SCSS and packages beyond the runtime set (e.g. `zod` in the browser).** These are reported in the preview limitations rather than faked.
3. **An in-browser code editor** with re-check on save. Today the files are view-only; edits go through AI or the user's IDE.
4. **Live tests that need an account**: reopening a saved project, «Исправить с AI» on an artifact.
5. **Translation of the rest of the Work UI** into EN/KK/AR (the studio is done).
6. **Forced-timeout live test** of the 8 s preview watchdog.

## 6. Tests

| Command | Result |
|---|---|
| `npm run test:work-code` | 21/21. Files, ZIP security, diagnostics, preview, statuses, route with the private store, self-repair, export/DOCX/PDF/XLSX, data |
| `MALIK_QA_BASE_URL=… npm run test:work-code-live` | All passed at 1280 and 390 px. Upload, preview, state, navigation, sandbox isolation, mobile, tree, viewer, skipped files, ZIP, guest saving, broken ZIP → FAILED with file:line, runtime error → FAILED, Arabic RTL |
| `npm run test:release-core` | 48/48 suites |
| `npm run build` | passed |
