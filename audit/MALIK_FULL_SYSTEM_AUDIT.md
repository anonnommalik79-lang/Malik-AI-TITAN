# Malik AI — full system audit and repair

Started 2026-10-26. Branch: `codex/full-system-audit-20261026`, base `4f8f601c`.

## Evidence rules

Statuses: VERIFIED PASS / FIXED & VERIFIED / FAIL / BLOCKED / UNVERIFIED. A rendered screen, fixture test and live generation are separate checks. No paid media generation, destructive production tests, credential copying, Vercel changes or hidden auth bypass. User authorized exactly one short text-model request; authenticated tests await the user's own login. Missing dependencies do not stop unrelated sections.

## Verified deployment baseline

- Render workspace explicitly confirmed earlier: `tea-d9ij383rjlhs73f2hto0` (Doxbin's workspace). Request-scoped workspace used; global fallback has no workspace selected.
- Service `srv-dase4v0473hc73fte6vg`, MalikAI-V6.5-TITAN, Node web service, branch main, runtime free/build starter, autoDeploy no/trigger off.
- Current live deployment `dep-dbf73hdg1s2s73enj0e0`, commit `4f8f601c2657407e68fc94eb07c31bba48f58b28`, confirmed by Render API.
- URL from current Render service: https://malikai-v6-5-titan-f41r.onrender.com . No remembered custom domain assumed authoritative.
- Build/start from current configuration: `cd app/templates/sovereign-hub-ui && npm install --legacy-peer-deps && npm run build`; `cd app/templates/sovereign-hub-ui && npm run start -- -p $PORT`.
- HTTP healthCheckPath is empty (TCP default); no configuration changed.
- Browser: initial navigation timeout, subsequent navigation loaded `/auth`; guest button reached `/dashboard`. After session synchronization, chat and sidebar rendered at 1440x1000. Retrieved warning/error console was empty at this point; not a whole-session console clearance.
- Retrieved Render errors include old Server Action `x` failures and test-output lines labelled error during builds. These are not yet attributed to a current user scenario.

## Architecture / configuration boundaries

Actual app: `app/templates/sovereign-hub-ui` (Next 16/React 19). `app/dashboard/page.tsx` uses optional WorkOS auth or server guest cookie, wraps Dashboard with account chat persistence. `dashboard.tsx` owns in-page views/work mode; `sidebar.tsx` defines the current menu. There are 246 page/route/layout/error source files in the initial inventory, not 246 user-visible features.

Auth: WorkOS via `lib/auth/server.ts` and `client-session.ts`; owner authorization via `admin-policy.ts` and founder server access. No local private env in this checkout; only public `.env*.example` files. Production provider/storage presence must be verified separately, never inferred from examples. Existing model router/MAX, media providers, PostgreSQL/private-state and object-store adapters are retained. No SDK/provider migration is part of this audit.

## Sidebar map (exact observed order)

All main items below were observed in the real production desktop UI. Route `/dashboard` is shared unless a route or overlay is specified. This table is an inventory, not an assertion that all workflows pass.

| # | Section | Component / entry | API / dependencies | Permission / full workflow status |
|---|---|---|---|---|
| 1 | Новый чат | Dashboard / ChatView, home | `/api/stream`, model router, usage, account history | UI VERIFIED PASS; generation/history UNVERIFIED |
| 2 | Голосовой режим | `components/voice/VoiceMode.tsx`, overlay | `/api/voice/{gemini-live-check,gemini-live-token,turn,tts,deepgram-token}`, `/api/transcribe` | Mic, model/TTS quota; UNVERIFIED |
| 3 | Библиотека | Dashboard `ChatsListView`, view templates | existing account chats, no duplicate media store | UNVERIFIED |
| 4 | Проекты PRO | `projects/ProjectsWorkspace.tsx` | account project/chat persistence | PRO/owner; UNVERIFIED |
| 5 | Задачи | OS MissionControl, `openOs('tasks')` | `/api/os/flows`, `/api/os/projects` | user ownership/tool approvals; UNVERIFIED |
| 6 | Бизнес под ключ PRO | `business/AutonomousCompany.tsx` | business/OS routes, models | quota/tool permissions; UNVERIFIED |
| 7 | Malik Work NEW | existing chat work mode; WorkCodeStudio overlay | `/api/work/{code,export,github,skills}`, project artifacts, external executor | no sandbox inferred; UNVERIFIED |
| 8 | Malik Shorts BETA | route `/shorts` | `/api/shorts/{feed,posts,upload,me,library,history,providers}` | user/storage/media quota; UNVERIFIED |
| 9 | Сайты | `digital-bridge-sections.tsx`, website-generation view | `/api/generate/website`, existing generated-site engine | model quota, publishing permission; UNVERIFIED |
| 10 | Генерация видео | `video-generation/VideoGenerationStudio.tsx` | video start/status/file routes | provider credits/queue/storage; UNVERIFIED |
| 11 | Создать трек PRO | `music-generation/MusicGenerationStudio.tsx` | music start/status routes | PRO/owner + credits; UNVERIFIED |
| 12 | Презентации | `presentations/PresentationStudio.tsx` | presentation generation/export routes | model/presentation credits; UNVERIFIED |
| 13 | Генерация изображений | `photo-generation/PhotoGenerationStudio.tsx` | `/api/ai/image`, credits, download | image provider/credits; UNVERIFIED |
| 14 | Плагины | FeatureCenter, features view | `/api/plugins/{status,connect}`, OAuth/OS plugins | provider account scopes/approvals; UNVERIFIED |
| 15 | Compute | `compute/ComputePanel.tsx` | `/api/compute` | server quota/account; UNVERIFIED |
| 16 | Переводчик | sidebar translation action / existing OS | translation/OS/model path | model quota; UNVERIFIED |
| 17 | Анализ данных | sidebar data action / existing OS | OS data/artifacts, analyst engine | safe upload/account; UNVERIFIED |

Conditional Founder DB (`/founder/history`) is defined in code but not visible to the guest. Owner browser check BLOCKED pending verified account; server denial remains required.

Additional actual sidebar controls: Search/Ctrl+K; collapse/expand; chat history with select/pin/rename/delete; profile menu; subscription; settings; capabilities; support; logout. Profile code additionally exposes Malik Codex and conditional admin console. Inventory verification of the opened profile menu is pending. No history deletion is authorized in production.

## Sequential checklist / real-time results

For each section: open → controls/inputs/menus → validation → permitted real action → result → cancel/retry/error → reload/re-entry → keyboard → desktop/mobile → console/network → regression → retest. Mark blocked dimensions explicitly, not green.

| Section | Problem | Repair | Browser Test | Regression Test | Status |
|---|---|---|---|---|---|
| Auth entry | First browser operation timed out; second reached auth | No auth-policy change | Guest transition and chat render observed | Existing auth/build guards passed | Guest entry VERIFIED PASS; OAuth BLOCKED |
| Chat | One-turn answer completed; full history/provider acceptance pending | Shared request-helper lifecycle fixed, not a rewrite of the main chat stream | Real answer 391, menu opens | Local release-core + 20 cancellation cases pass | Single scenario VERIFIED PASS; full acceptance BLOCKED |
| Sidebar / footer | Guest Shorts requires sign-in; remote video icon returns 404 | No redesign or auth bypass | At both 375/1440: 16 screen roots + 1 auth-blocked route; settings/support open/close | Reproducible Playwright probe | Safe navigation VERIFIED PASS; workflows BLOCKED |
| Founder overview | Missing cache-control on denied response | private/no-store, Vary Cookie | Actual old production FAIL; compiled local server retest PASS | 4 tests PASS | Local FIXED & VERIFIED; production UNVERIFIED |

## Release / acceptance

No deploy triggered by this audit. No full-system PASS. Staging not configured/verified. Exact test commands, logs, screenshots, defects, changed files and final commit will be appended as they are obtained.

## Confirmed findings and repairs

| ID | Root cause / evidence | Repair | Re-test / boundary |
|---|---|---|---|
| C1 | `apiFetch` replaced the caller's AbortSignal; its nested header-only fetch helper detached cancellation before JSON body consumption finished | One controller now owns the network request and body; parent cancellation is forwarded, pre-aborted requests do not start, listeners are removed | 20 shared client regressions; actual Chromium -> HTTP partial body -> cancel on 375/1440 px, no provider fixtures in that browser transport |
| C2 | `osFetch` did not handle a pre-aborted caller, leaked listeners on completed reads and swallowed a cancelled JSON read as an HTTP-200 failure | Forward reason, pre-abort guard, body-abort check, explicit CANCELLED result with no automatic retry action, cleanup in finally | Same regression suite and real browser body interruption; no claim that every external provider refunds/stops its own job |
| S1 | Production `/api/founder/overview` correctly denied an unauthenticated caller (403), but omitted cache-control on that response | All overview responses are private/no-store and vary by Cookie; owner policy unchanged | 4 route tests with actual owner policy and fixture auth/usage, no real account directory read; production re-test pending release |
| T1 | `verify-fact-audit` required exactly two audited answer paths, while current main correctly added a third deadline-rescue path | Assert all three final evidence-gated paths; no assertion removed | Existing complete release-core retest PASS |

Initial cancellation test run: 6/16 PASS, 10 FAIL. One of those failures was an incorrect test assumption about OS success having a `status` property; corrected against its existing `{ok,data}` contract. Subsequent browser tests exposed the additional body-consumption defect rather than accepting unit-only success. Final new tests: **24/24 PASS** (20 cancellation/body-deadline + 4 overview headers/access).

The old photo studio was intentionally removed by commit `5339b7cb`. The user explicitly reconfirmed **keep the Voltframe banner until launch** during this audit. No restoration or redesign was made. This is a documented product limitation, not a working image-generation studio.

## Actual production checks

One authorized text request was submitted in the app browser: `Ответь только числом: 17×23`. The UI displayed `391`, completed in 11.5 s and displayed 4,707 tokens, selected route MalikLLM MAX. The underlying provider/model ID and raw provider usage were not captured for this request, so their accuracy remains UNVERIFIED; the shown tokens are not independently certified here. No second text-model request or paid image/video/music generation was submitted by the audit.

Public safety runner: **10/11 PASS on current production**, one FAIL for the overview cache header described above. Specifically verified: public health HTTP 200 (one sample 726 ms, not a latency benchmark), unauthenticated auth status with no identity, configured-provider metadata (not live availability), access/messages owner denial, real static Work diagnostics (0 errors on supplied HTML), preview containing the actual supplied fixture, traversal rejection (400), guest save denial (401), actual small DOCX ZIP signature (4,534 bytes). DOCX visual acceptance and preview runtime are separate UNVERIFIED checks.

Provider metadata reports configured: ModelScope, AIHubMix, Cerebras, Groq, Gemini, Mistral, OpenRouter, ElevenLabs, WorkOS. Configuration is not availability, entitlement or usable credits. No secret values were read or saved.

Render sampled metrics (15-minute resolution, not a stress test): memory samples 254,840,830–305,999,870 bytes, limit 536,870,900 bytes; last sample about 57% of limit. CPU unit returned is `cpu` (0.004051428 versus limit 0.15 at last sample), not an already-normalized percentage. No memory/performance improvement is claimed from these observations.

## Browser scope and section-specific checklist

Source map: `audit/SYSTEM_MAP.json` mechanically records 17 sidebar entries and 243 page/API source files; the earlier count 246 also included layouts/errors. Menu IDs/routes/imports are source evidence, not a claim that every route was called.

Final 375/1440 probes each attempted all 17 named entries: **16 screen roots VERIFIED PASS, Shorts BLOCKED by auth**, plus two settings/support open-close checks VERIFIED PASS. The refined probe waits for actual dynamic roots and tests library/plugin search. Shorts 401 responses from `/api/tiktok/status`, `/api/shorts/me`, notifications and following are retained as expected auth denials. Navigation aborts (`ERR_ABORTED`) during leaving Shorts/translator are recorded, not counted as backend crashes. A separate focused browser probe traced the reproducible video-console 404 to **external `t3.gstatic.com/faviconV2`** (provider favicon), not the video generation API. This cosmetic asset failure is explained but **not repaired** in this checkpoint; all external failures are captured by the final runner without URL query strings.

| # / section | Safely exercised | Still BLOCKED or UNVERIFIED |
|---|---|---|
| 1 Chat | Real one-turn answer/completion, model selector, actual mobile/desktop entry; no repeat submitted | Underlying provider ID/usage, long-turn regeneration/cancel, authenticated history/context, uploads |
| 2 Voice | Open/close modal, existing local voice regressions and animation suites | Hardware mic/speaker, real STT/TTS, RU/KK/EN speech, barge-in, echo, reconnect under a real account |
| 3 Library | Render and empty-state/search input accepting and clearing a synthetic query | Real account history/reload, media availability, mutation/pin/rename on disposable test data |
| 4 Projects | Guest PRO dialog and dismissal | Authenticated project CRUD, cloud persistence, cross-device ownership |
| 5 Tasks | OS dialog entry and dismissal | Real flow execution/retry/cancel/persistence; needs authorized tools/quota |
| 6 Business | Entry to Autonomous Company | Eight-agent task completion, model/tool permissions, real exports |
| 7 Work | Work-mode entry; actual public diagnostics/preview/export and guest-save denial | Model-authored project/runtime/ZIP E2E and configured isolated executor; authenticated saves |
| 8 Shorts | Route entry/auth gate, real 401 denials | Signed-in feed/playback/upload/social actions/storage; no login automated |
| 9 Sites | Website Builder entry/controls | Actual model generation, download/publish/reload under authorized quota |
| 10 Video | Entry/dynamic studio root | Paid provider queue -> actual ready file -> duration/play/download/image-to-video |
| 11 Music | PRO dialog and dismissal | Authenticated generation/provider credits/real playback and download |
| 12 Presentations | Entry/dynamic studio root | Real generation, slide edits, PPTX/PDF content/visual checks |
| 13 Images | Current banner entry | Intentionally closed until Voltframe launch, explicitly confirmed by user |
| 14 Plugins | Catalogue and search input accepting/clearing synthetic query | OAuth consent, provider connection, real account/project operation and scope isolation |
| 15 Compute | Actual `/compute` navigation/root | Balance update after real action, admin totals/provider telemetry, persistent accounting |
| 16 Translator | Actual route, text/document controls visible | Real translation/document/TTS, language and reload acceptance; no extra model quota granted |
| 17 Data analysis | Existing chat-prefill entry | File upload -> parser -> deterministic analysis -> true artifact -> restore |

Per-section checklist remains partial: opening/rendering is not equivalent to every visible button/form tested. Search, footer/profile extras, cross-browser Safari/Android/iPhone hardware, all localization states, offline/reload and all server-error combinations are not universally certified. Synthetic transport tests cover 401/403/429/500/network errors in the two changed helpers; they are not production provider outage tests.

## Commands and evidence

QA root: `D:/mqa/full-system-audit-20261026`. No private `.env`, `.data` user stores or git credentials copied. Actual production source hashes for all three repaired runtime files match the build mirror.

| Command / check | Current result | Evidence |
|---|---|---|
| `npm run test:release-core` | VERIFIED PASS on retest; two optional browser checks initially skipped, separately executed below | `release-core-retest.log` (first baseline failed only stale fact-audit count) |
| `node --test scripts/verify-client-cancellation.mjs scripts/verify-founder-overview-access.mjs` | VERIFIED PASS 24/24 | `new-regressions-24.log` |
| `npm run test:client-cancellation-browser` | FIXED & VERIFIED 375/1440, real local HTTP body abort and no page errors/overflow | `cancellation-browser-confirmed.log`, `evidence/cancellation/cancel-*-after.png` |
| `node scripts/verify-request-motion-parity.mjs` with configured Playwright | VERIFIED PASS phone/tablet/desktop/low-FPS/reduced-motion parity | `motion-parity.log` |
| `node scripts/verify-request-motion-keeper.mjs` with configured Playwright | VERIFIED PASS 22 checks | `motion-keeper.log` |
| Full `npm run lint` equivalent | FAIL: 613 errors, 353 warnings; 535 errors are in two vendored React distribution files, others include old source and test rules | `lint.log`; no exclusions/rules weakened |
| ESLint of all modified source/tests | VERIFIED PASS, no errors/warnings; last additional body-deadline tests checked separately before commit | `lint-changed-final.log` |
| `npm run build -- --webpack` (all existing build guards retained) | VERIFIED PASS: compile + TypeScript + 85/85 static pages | `build.log` |
| `tsc --noEmit` | VERIFIED PASS with local 1536 MB heap; initial 1024 MB run failed OOM, no diagnostics suppressed | `typecheck-retry.log` (first failure retained in `typecheck.log`) |
| `node scripts/audit-public-safety.mjs` against verified Render URL | 10 VERIFIED PASS, 1 FAIL (old production cache header) | `public-safety.log`, `evidence/public/public-safety.json` |
| `node scripts/audit-sidebar-live.mjs` widths 1440/375 | At each width 16 navigation/root checks VERIFIED PASS, 1 auth BLOCKED, settings/support 2/2 VERIFIED PASS; not all forms or generators certified | `sidebar-final-1440.log`, `sidebar-mobile-verified.log`, `evidence/final-1440/`, `evidence/mobile-verified/` |
| Public safety against compiled local Next production server | VERIFIED PASS 11/11, including the repaired overview cache header | `public-safety-local.log`, `evidence/local-production/public-safety.json` |

Early browser-harness failures were recorded: auth hydration race, duplicate responsive auth controls, searching an inert drawer as geometrically visible, PRO modal not yet dismissed, wrong placeholder versus actual plugin aria-label, and Shorts auth redirect. Those are test-harness corrections, not fabricated product fixes. Final runner uses the same genuine server `/guest` route as the separately exercised guest button; never forges cookies. Error URLs are stripped of query strings in the final runner to avoid recording OAuth state. Preliminary private logs with raw browser diagnostics are not published as source artifacts.

## Remaining blockers / release gate

- User offered to sign in themselves, but no verified signed-in test session was established for this audit. No password/code/cookie extraction or auth bypass.
- Additional paid/provider workflows require explicit quota/spending permission; only one short text-model turn was authorized.
- Image studio remains intentionally unavailable by the user's decision; a full-platform generation PASS would be false.
- Full lint remains FAIL; production overview header re-test requires a reviewed release. No Render deployment or main merge is claimed.
- Separate staging environment is UNVERIFIED, no production data migrations performed. Existing account data and other agents' commits preserved.

**Mission status: INCOMPLETE.** Ready-to-review fixes are limited to cancellation lifecycle, overview cache privacy, the stale regression assertion and reproducible audit tools. This report deliberately does not certify every sidebar feature as production-ready.

## Changed files and handoff

Runtime changes (only three; no global styles/layout/navigation edited):

- `app/templates/sovereign-hub-ui/lib/api-client.ts`
- `app/templates/sovereign-hub-ui/components/sovereign/os/os-client.ts`
- `app/templates/sovereign-hub-ui/app/api/founder/overview/route.ts`

Checks/tooling: app `package.json`; `scripts/verify-fact-audit.mjs`; new `verify-client-cancellation.mjs`, `verify-client-cancellation-browser.mjs`, `verify-founder-overview-access.mjs`, `audit-sidebar-live.mjs`, `audit-public-safety.mjs`, `audit-system-map.mjs`. Inventory/report: this file and `audit/SYSTEM_MAP.json`.

Re-run from the app directory with the documented existing Playwright/Chrome paths: `npm run test:full-system-audit`, `npm run test:client-cancellation-browser`, `npm run typecheck`, `npm run lint`, `npm run build -- --webpack`. `MALIK_AUDIT_URL` must be the verified intended target; live browser/API probes use only their listed harmless cases. Do not broaden the scripts to paid generation, persistent user mutations or OAuth grants without permission.

Counts: 17 main sections inventoried/attempted; 0 full-section production certifications; 3 runtime defect groups fixed locally and re-tested; 1 stale test fixed; 2 known remaining issue classes (existing full-lint errors and external favicon 404), plus authenticated/paid/hardware workflow blockers detailed above. No new release/deploy ID. Production remains the initial verified Render deployment; safe audit branch is the intended commit/push target. Fresh main was re-fetched and remains `4f8f601c`; no other agent's commit overwritten.
