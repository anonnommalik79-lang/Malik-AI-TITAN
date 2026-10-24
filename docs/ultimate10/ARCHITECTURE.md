# MALIK AI — ULTIMATE 10: architecture and integration plan

Audit date: 2026-10-24, branch `feat/ultimate10` from `main` @ 09464e6f.
This document describes what exists, what each of the ten systems reuses, and
what is added. Nothing here claims a capability is finished: readiness and
test evidence live in `FEATURE_MATRIX.md` and `TEST_REPORT.md`.

## 1. The application as it is

| Layer | Where | Notes |
|---|---|---|
| Frontend | `app/templates/sovereign-hub-ui` — Next.js 16 App Router, React 19, Tailwind 4 | One main chat (`components/sovereign/dashboard.tsx`, `chat-view.tsx`, `MalikMarkdown.tsx`) plus studios (presentations, Work, sites, shorts, media) |
| Backend | Next.js route handlers, Node runtime (`app/api/**`, ~190 routes) | Main chat: `app/api/stream/route-impl.ts` (SSE) |
| Models | `lib/server/malik-model-router.ts`, `lib/server/malik-max-engine.ts`, `lib/malik-god-router.ts` | MalikLLM MAX: lanes per provider key race, elite-first, bounded expert panel + one synthesizer, continuation with honest «incomplete» notes |
| Streaming | SSE events `status / progress / content / done` in the stream route; background turns survive reloads (`background-chat-turns.ts`) | |
| Tools and agents | `lib/os/*` — planner → task graph → executor → tool registry (`lib/os/tools/registry.ts`), actions gated by confirmation; `lib/server/malik-agent-runtime.ts` read-only subagents | «Superflow» block in chat |
| Files and artifacts | `lib/work/documents/*` (docx, xlsx, pptx, pdf, zip), `lib/server/project-artifact-store.ts`, OS library (`lib/os/library.ts`) with lineage and semantic search | |
| Storage | Postgres when `DATABASE_URL`/`PRIVATE_STATE_DATABASE_URL` is set (`lib/server/durable-postgres.ts`), otherwise file/runtime stores; browser storage for client memory | |
| Auth | WorkOS AuthKit, `lib/server/request-entitlement.ts`, plan-based quotas | |
| Deploy | Render, `render.yaml`, Node 22.14, autoDeploy from `main` | Starter plan: 512 MB RAM — no heavy builds in the web process |

Disk note for local work: drive C: is almost full; production builds are run
on a copy on D: (see `DEPLOYMENT.md`).

## 2. The ten systems mapped onto the code

Maturity: **exists** (working, tested), **partial** (real parts, gaps), **new** (not in the code).

| # | System | Reuses | Maturity before this work | What is added |
|---|---|---|---|---|
| 1 | World Engine | Game Studio runtime and its isolated runner (`lib/games/*`), chat preview iframe, artifact store | **partial** — 2D canvas games only; a separate session is adding Three.js games | Scene spec (JSON) → Three.js page; chat edits change the spec, not free code; save/restore/export |
| 2 | Self-Build | Project builder (`lib/ai/project-builder.ts`), code diagnostics (`lib/work/code/diagnostics.ts`), Game Studio's isolated child-process runner, website engine executor contract | **partial** — static QA + model review; no real run of generated code except games | Requirements → plan → files → real isolated run of `node --test` (permission model, temp dir only) → diagnose → bounded repair → ZIP + passport |
| 3 | Truth Engine | Fact audit (`lib/ai/fact-audit.ts`), accuracy engine (`lib/ai/accuracy/*`), truth checks v2, on-demand verify route (`app/api/ai/verify`), MAX expert panel | **partial** — per-figure verdicts against sources, deterministic arithmetic correction; no unified status scale, no cross-model disagreement report | One claim ledger with VERIFIED / SUPPORTED / UNCERTAIN / UNVERIFIED and a written methodology; expert-panel disagreement becomes UNCERTAIN; attached to MAX answers |
| 4 | Oil Digital Twin | Petroleum engine (`lib/work/petroleum/*`: schema, DCA, economics, volumetric, evidence ledger, snapshots, reports), oil report UI | **partial/exists** — calculations, evidence and reports exist | Twin model (assets + data + versioned scenarios) over the existing formulas; demo data labelled as demo |
| 5 | Mission Control | Malik OS planner / task graph / executor / tools, agent runtime | **partial** — rule-based graphs, parallel tasks, confirmation for actions | Roles (planner, researcher, developer, designer, tester, critic, integrator) as task kinds with a final critic/integrator check; cancel; bounded retries |
| 6 | Live Studio | Work Code Studio (`components/sovereign/work-code/*`: files, diagnostics, live preview, export) | **partial** | Chat edit → file changes → re-check → preview; change history; desktop/mobile check |
| 7 | Proof Passport | Game Studio QA, forge quality review, project builder QA | **new** (`lib/proof/public-proof.ts` is a marketing page, not test evidence) | `lib/proof/passport.ts`: one passport schema and builder; PASS only from executed checks; shown in chat, stored with the artifact |
| 8 | Omni Live | Voice stack (`lib/voice/*`: Deepgram STT, Gemini Live, TTS, streaming LLM, spoken intent), multimodal routing | **partial/exists** — tested voice paths (`test:voice-*`) | Context hand-off between voice and text, honest limits; image/document in voice turns |
| 9 | Deep Research | `lib/malik-research/*` (search, bounded fetch, ranking, answer), live-intelligence index, web-research recovery | **partial** | Explicit research plan, claim provenance, dated report, Markdown export, continue-research |
| 10 | Second Brain | Client memory (`MemoryManager`), OS library with lineage + semantic search, projects v2, Postgres chat history, memory isolation tests | **partial** — memory is browser-local | Server-side, account-scoped memory with sensitive-data guard, project context, export and deletion |

## 3. The shared layer

The directive's shared layer already exists in pieces; it is reused, not rebuilt:

| Shared piece | Existing implementation |
|---|---|
| Intent detection | `lib/ai/conversation-intent.ts`, `lib/ai/domain-intelligence.ts`, `lib/ai/chat-artifact-skills.ts`, studio turn detectors (`gameStudioTurn`, `siteForgeTurn`) |
| Model router | MAX engine (elite-first, cooldowns, quotas), `malik-model-router.ts` |
| Tool registry | `lib/os/tools/registry.ts` |
| Task orchestrator | `lib/os/planner.ts`, `task-graph.ts`, `executor.ts` |
| Context manager | history compaction (sites, games), conversation focus, attachments routing |
| Project store / artifacts | OS library + project artifact store |
| Verification engine | fact audit, accuracy engine, Game Studio QA, forge quality → unified by the Proof Passport and the truth ledger |
| Streaming events | SSE + `ExecutionReporter` activity (`MalikLiveActivity`) |
| Permission manager | OS actions requiring confirmation, entitlement and quota checks |

## 4. Order of work

1. Foundation: this audit, branch, docs, tests runnable.
2. Reliable core: Proof Passport → Truth ledger in MAX → Self-Build with real isolated runs.
3. Platform: Mission Control roles on Malik OS, Live Studio chat edits, Deep Research plan/provenance/export.
4. Experience: Omni Live context hand-off, Second Brain server memory.
5. Engines: World Engine scenes, Oil twin scenarios.
6. Integration through the main chat and the shared layer above.
7. QA: end-to-end tests per system, regressions (`npm run test:release-core`), security checks.

Every step ends with tests that run in `npm` scripts; results are recorded in
`TEST_REPORT.md` as they are, including failures.
