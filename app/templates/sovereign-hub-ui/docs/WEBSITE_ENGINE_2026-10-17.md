# Malik AI — Website Engine audit and delivery

Date: 2026-10-17. Branch: `codex/website-engine-20261017`.

## Scope and release boundary

The user's latest instruction overrides the original Sites UI proposal: **do not change the Sites section; implement project creation in chat and Malik Work**. The Sites gallery, `WebsiteGenerationStudio`, `SitesRouteFixRuntime`, `lib/sites`, existing generation endpoint, navigation and global CSS remain unchanged. No Render deployment, production database migration, new paid service or main push is performed.

This is a source-generating, checkpointed chat project engine with a tested browser preview and a secure execution transport boundary. It is **not** a deployed autonomous sandbox, a guarantee of design quality, or a claim that arbitrary applications have passed production builds.

## Audit: evidence, not reconstructed incidents

| Reported problem | Confirmed repository finding / remaining uncertainty | Change |
| --- | --- | --- |
| AETHER files outside the launched Next project | The actual AETHER workspace/logs are not supplied. The shared `normalizeProjectFiles` unconditionally removed any common folder, including `app/`; this is independently reproducible. | Managed writes explicitly preserve root-relative paths. One project UUID/root, validated manifest, rejection rather than silent renaming, one ZIP root. |
| `<Compass/>` without an import | Existing `transpileModule` diagnostics parse syntax and imports, but do not bind JSX identifiers. Syntactically valid unbound JSX passed that layer. | Real TypeScript lexical binding checks and a regression that detects and repairs this exact error. No assertion of full library type checking without installation. |
| VISUAL_DATA / missing video | Existing Forge is photo/content-plan oriented. There is no shared verified video/source manifest in the chat project pipeline. | Bounded Pexels/NASA/Unsplash metadata adapters, MIME/HEAD checks, explicit missing slots, visible source credits and an asset manifest. Fake media and starter text are rejected. |
| Windows SWC/Turbopack/types failures | The reported failing machine/project is unavailable. Native binding and WASM errors cannot be attributed to application TSX from a screenshot alone. | Separate diagnostic categories; generated Next guidance uses supported Webpack development, declared compiler/types, exact dependency versions, isolated installs only. |
| Creation answered as news | Freshness checks preceded the generic code/creation exclusion in web policy; project creation could also bypass chat via Canvas flags. | Pure website intent, code/asset/research separation, project handoff before the research gate, dated-brief + forced-Canvas SSE regression. |
| ~157-second failure | Existing Sites client uses a single 180,000 ms fetch. Exact 157-second server incident is not reproduced. Long generated output has no per-file durable checkpoint in that route. | Chat returns a persisted project ID promptly; each bounded stage generates at most one complete file. File checkpoint survives interruption. No partial code is labelled complete. |
| Commands instead of usable delivery | Existing Sites delivery is standalone HTML and browser-local history, not a durable multi-file project. | Chat card, existing code studio, actual sandboxed iframe, multi-page navigation, source ZIP, resume/edit/restore. |
| Misdiagnosis after browser error | Historical model conversation/browser logs are unavailable. | File/line diagnostics and explicit environment categories. Missing execution evidence is `not_run`, never fabricated success. |

## Implementation map

All engine modules are under `lib/website/engine/`:

- `types.ts`: typed state/check/event contracts.
- `intent.ts`, `chat.ts`: direct creation/edit/preview intent; ownership-checked project references in chat/Work.
- `workspace.ts`: root/path/secret/Windows-safe source validation, patch preservation, JSX bindings, dependency/lockfile diagnostics.
- `store.ts`: existing private off-host JSON store, conditional revisions, durable queue, two-worker permits, fenced leases, idempotency, snapshots and rollback (including design/media metadata).
- `design.ts`: brief-specific typed design/file manifest; different composition constraints for cinematic, automotive, hospitality, editorial, commerce, SaaS and minimal projects. The model writes the source rather than selecting a fixed rendered template.
- `media.ts`, `credits.ts`: permitted-provider discovery and real source attribution.
- `model.ts`: existing selected-model runtime, model entitlement, token and Compute checks. No parallel competing final answers. Specialized non-code modes delegate coding to the existing default engine.
- `runner.ts`: one bounded work unit per call, static analysis, at most three repair rounds, timeout/backoff, cancellation and crash recovery.
- `executor.ts`: HTTPS/authenticated adapter contract for a separate restricted execution service. No shell or package installation on the Malik web server.
- `http.ts`: private project/control/events/preview/export handlers; server session owns all operations.

`components/sovereign/work-code/WebsiteProjectCard.tsx` renders the handle in an answer. `MalikMarkdown` recognizes only the reserved `malik-project` fence; it is not included as a source file in generic downloads. Shared/public answers do not fetch or advance private projects.

The existing Work code studio supplies the file tree, source viewer, diagnostics, desktop/mobile preview and export. Its default behavior is preserved. Multi-page static preview now routes local document links inside its sandbox; preview-only verification is labelled separately from production build verification.

## Execution and durability

`queued → planning → designing → assets → coding → installing → building → testing → preview_ready → completed`

Additional states: `paused`, `resuming`, `failed`, `cancelled`.

Each source file is committed through conditional storage writes. A failed/stale worker cannot overwrite a cancellation or a newer lease. Source is not cached in a global process map. Limits: 32 planned files per turn, 80 cumulative text files / 2,000,000 source characters, 16 media slots, two concurrent stages, three repair attempts, bounded executor polling, 100 automatic browser steps. Version limits and account limits are explicit rather than silently dropping earlier projects. An external model call may be retried if a process dies before its checkpoint; exactly-once provider billing is not promised.

Without a deployed worker, the browser advances checkpoints and returning to the chat resumes them. Closing the browser does **not** magically create an always-on worker. `scripts/website-worker.mjs` is a separate optional driver with SIGTERM/SIGINT draining and a circuit breaker. It is not started by the web app. Unattended execution is disabled by default and authorized only in a bounded 15-minute server-issued window before an authenticated refresh is required.

Projects use the already configured PostgreSQL/private object storage; this change does not provision a second database or write generated source into Render's filesystem. Ordinary request processing still uses RAM. Storage capacity, retention and disaster backups remain infrastructure responsibilities; no unlimited/permanent-storage promise is made.

## Media and licensing

Providers are attempted sequentially for a slot; at most two slots execute concurrently. Search metadata is streamed with a 1 MB cap; assets are checked with HEAD, not downloaded into the web process. URL allowlists, HTTPS-only requests, redirect rejection, MIME and size limits guard external fetching.

- Pexels: photos and video, when `PEXELS_API_KEY` exists. Source/creator attribution retained. [API docs](https://www.pexels.com/api/documentation/).
- NASA: only conservative editorial astronomy candidates, not blanket commercial permission, NASA endorsement, people/logo clearance or third-party copyright clearance. [Usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
- Unsplash: hotlinked API URLs, selection tracking, photographer-profile and Unsplash source links with referral parameters. No bulk redistribution of image bytes. [API guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines).

Credits are inserted into generated HTML/Next layout source and updated on edits; ZIP includes `MALIK-ASSETS.md`. A missing photo/video remains a failed media slot, not a fictitious URL. CSS/SVG/Canvas alternatives may be used as original visuals but are not called photographs or video. Pixabay, automatic asset transcoding, video poster generation and a general third-party licensing approval service are not implemented.

## Build, preview and security

`validate sources → check dependency manifest → isolated executor if configured → check matching source hash/receipts → iframe preview → source ZIP`.

The built-in browser preview uses the existing TypeScript transpiler and local React runtime. It is not npm install, a Next production build, a server-action runtime, backend hosting or a GPU/WebGL certification. Full completion requires a matching executor result with successful dependency/build/browser checks and no missing media. With no executor, source/preview delivery pauses at `preview_ready`; ZIP stays available and checks say `not_run`.

The executor must be separately deployed and reviewed for filesystem isolation, disabled install lifecycle scripts, allowlisted registry egress, CPU/RAM/time limits, process termination, non-privileged execution and private, separate-origin previews. The adapter requests those policies but cannot certify a remote deployment merely because a URL is configured. It receives **no app environment, WorkOS keys or model keys**. Unsafe/mismatched results are rejected. No public deployment operation runs automatically.

New routes require authenticated server identity; IDs/emails/plans from JSON cannot grant access. Cross-origin writes, traversal, absolute paths, Windows ADS/device names, secret files, source credential patterns and unsafe dependencies are rejected. Guest chat retains its existing non-durable coding path instead of receiving fake saved projects. A small pre-existing Next route signature mismatch in founder storage health is also corrected; access policy is unchanged.

## Verification evidence

Automated tests execute production TypeScript/state/compiler/API code. External model, identity, storage and executor transports are explicitly labelled fixtures. They do not prove production WorkOS sessions, live model quality, external sandbox availability or arbitrary generated-project compilation.

- `verify-website-engine.mjs`: intent, root preservation, missing JSX binding + actual repair, complete-source gates, idempotency, queue/restart/races, cancellation, versions, quota, source-hash receipts, cross-account access, ZIP contents, static-page routing and actual chat SSE dispatch.
- `verify-website-engine-browser.mjs`: real React card → HTTP API → saved job → source compiler → opaque sandbox iframe → interaction → multi-page navigation → ZIP → page reload. Cosmic 1440 px, automotive configurator 390 px, hotel demo booking 768 px. No browser page errors or horizontal document overflow in these tests.
- Existing Site Forge and Work Code regressions are run to verify the untouched generator and shared preview behavior.
- App quality gates, TypeScript and production compilation results are recorded in the final delivery. QA uses existing dependency binaries, not production keys.

Recorded results:

- New engine: **66/66 PASS**; together with Site Forge (16), Work Code (21) and founder history (15): **118/118 PASS**, no skipped tests. Full local output: QA `evidence/website-unit-tests.txt`.
- Browser: **PASS** at 1440/768/390 px, including actual navigation, controls, ZIP, reload, and pause/cancel while a model stage is in flight. A fixture-origin mismatch discovered during reruns was corrected, not bypassed; a separate regression emulates Render's internal HTTP URL and rejects unrelated origins/forwarded hosts. Preview runtime URLs use the existing trusted public-origin resolver.
- Live NASA discovery: a real image and MP4 were verified by metadata/HEAD requests in **1,865 ms** in one measured run. The test first exposed official collection entries using HTTP; the adapter now upgrades only NASA's exact CDN host to HTTPS. No media bytes were downloaded. This is one live observation, not a latency SLA or blanket licensing clearance.
- Next.js app production compilation: **PASS** with `next build --webpack`, TypeScript and **84/84** static pages. The QA dependency junction is outside its Turbopack filesystem root, so the default Turbopack attempt failed for that environment-specific reason. No Turbopack success is claimed.
- The `npm run build` preflight checks passed when run outside Windows sandbox filesystem restrictions; its final branding check was run successfully in the original repository because it intentionally reads sibling services absent from the flat QA copy. Production compilation was then run separately. No production deploy was performed.

Environment-only failures (Windows sandbox temporary-file writes and flat-copy branding paths) and the browser Origin fixture failure were investigated and resolved for verification. They are not reported as production regressions or hidden behind fake PASS messages. Production WorkOS/model/sandbox tests remain unverified because no configured local credentials or isolated executor are available; none were bypassed.

Acceptance status: A/B/C/D/H/J have fixture-backed integration/browser evidence; E/F/G have deterministic/integration evidence. I covers diagnostic categories and a Windows app compilation, not reproduction of the user's original SWC installation. Actual model-generated cosmic/automotive/hotel builds on a deployed sandbox remain **unverified**.

## Owner validation after a reviewed deployment

1. Sign in, stay in normal chat or Work, select the model you want to use.
2. Send: `Создай космический сайт с восемью разделами, настоящими фото и видео, оригинальной анимацией и галереей. Покажи исходный проект и превью.`
3. Confirm a project card appears promptly; subsequent status describes real saved operations. Code must be under one UUID root, not a sibling `app/` directory.
4. Try the actual controls and local page links in preview at desktop/mobile widths; inspect failures/limitations instead of only the image.
5. Download ZIP; compare `MALIK-VERIFICATION.md` to the UI. No sandbox must mean `build: not_run`, not PASS.
6. Ask `Добавь страницу тарифов, остальные страницы сохрани`; verify the same project ID and preserved files. Restore a prior version.
7. Close/reopen the chat, cancel a running task, and try the project URL under another account (expected 404/401, not its files).

For production: deploy/review an isolated executor and optional worker, configure approved asset providers/rights, perform real-model + authenticated end-to-end smoke tests and load/quota/storage testing, then approve rollout. This branch is intentionally not deployed automatically.

Configuration names (server-side only, never submit values in chat or commit them): existing private-state database/object-store configuration; optional `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`; `WEBSITE_EXECUTOR_URL` + `WEBSITE_EXECUTOR_TOKEN` for the reviewed executor; `WEBSITE_PREVIEW_ORIGIN` for a distinct preview origin; `WEBSITE_WORKER_TOKEN` + `WEBSITE_APP_ORIGIN` and explicit `WEBSITE_UNATTENDED_ENABLED=true` only for a deployed worker. `MALIK_DISABLE_WEBSITE_ENGINE=1` disables the new path and leaves existing chat/Sites behavior available.
