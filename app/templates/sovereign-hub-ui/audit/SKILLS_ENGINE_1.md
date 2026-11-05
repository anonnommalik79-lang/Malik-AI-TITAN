# MALIK Skills Engine 1.0 — implementation checkpoint

Base: main `7e2338bf` (contains `55601c4a`). User requested stopping further development and committing this checkpoint. No UI, CSS, sidebar, animations, model registry or provider configuration changed. Render was not deployed.

## Audit

Existing Work has a 19-item capability catalog, but its direct run API executes only math, petroleum and document export. Superflow has 15 executable tools, dependency scheduling, retries, account-scoped storage and artifact validation. Forge and project generators produce real source. Research can search and fetch pages. The older agent runtime produces bounded read-only model reports; it is not an arbitrary shell/browser executor. These components did not form a single executable, verified skill registry.

## Implemented

| Skill | Actual sequence | Invocation |
|---|---|---|
| FORGE AUTOPILOT | Model plan → existing project/Self-Build generator → safe-path/syntax/import QA → matching-hash Node worker when supported → existing private artifact store → verification | `/forge <task>` |
| DEEP RESEARCH | Model query plan → existing sequential search-provider router → bounded public-page reader with DNS pinning → model synthesis → citation/freshness/arithmetic/provenance checks | `/research <question>` |
| AGENT TEAM | Separate researcher, implementer and reviewer calls; researcher can search/read; coding implementer creates/checks/tests/publishes source through the same adapters; final deterministic gate | `/team <task>` |
| MALIK VERIFY | Previous assistant answer or explicit text → deterministic arithmetic → search when needed/permitted → model review → verification of the original target and final text | `/verify [text]` |

Entry points: existing `/api/stream` SSE/text and `/api/ai/chat` JSON. Catalog: `GET /api/skills`. Owner-only polling: `GET /api/skills/runs/<id>`. Resume: `Resume task skill_<id>` / `Продолжи задачу skill_<id>`. Ordinary questions ABOUT these skills keep the existing chat pipeline. Selected model is passed to the existing strict router. No alternative chat engine or production auth bypass.

Checkpoint storage reuses existing private PostgreSQL/S3 conditional-write adapters when configured. CAS leases, immutable output hashes, bounded attempts, cancellation and persistent logical call/output-allocation budgets protect recovery. Without private storage the bounded 12 MiB process cache is explicitly temporary. Checkpoints are not a background worker: interrupted tasks require a resume request. Hashes bind content; they are not signatures.

## Files

- `lib/skills/{types,registry,store,tools,verification,orchestrator,runtime,chat-intent,chat}.ts`: contracts, four graphs, tool execution, deterministic gate, bounded state/recovery, existing-service adapters and chat bridge.
- `app/api/skills/route.ts`, `app/api/skills/runs/[id]/route.ts`: catalog and account-scoped status.
- `app/api/stream/route-impl.ts`, `app/api/ai/chat/route.ts`: narrow dispatch hooks and run metadata, preserving existing rendering and regular chat paths.
- `lib/ai/project-builder.ts`: optional server model adapter and abort signal; default callers retain their router.
- `scripts/verify-skills-{unit,integration,e2e}.mjs`, `scripts/fixtures/skills-fixture.mjs`: executable regressions, fixture boundaries labelled explicitly.
- `package.json`, `.github/workflows/malik-skills.yml`: repeatable test/CI commands.

## Verification and remaining work

Tests exercise real registry/orchestrator, exact arithmetic, static code diagnostics, state store, chat handlers and local HTTP/SSE. Provider/auth/cloud boundaries are fixtures. The Forge HTTP test executes only an immutable reviewed Node fixture in a restricted child process and checks its actual TAP result; it does not pretend to provision a production sandbox.

Not completed: authenticated live-model/browser acceptance for these four skills; production isolated npm build/browser worker; automatic background continuation after restart; binary attachment processing inside explicit skill invocations. Unsupported attachments are rejected before execution. No API credentials were added. No promise of exhaustive fact checking, exact provider-wide cost accounting or 100% answer accuracy. The logical budget counts calls into the existing router; provider retries/ensembles remain that router's responsibility.

Node tests without a worker and framework builds return `not_run`, making delivery PARTIAL. Failed static/runtime checks block publication. A model review alone is not proof, and omitted original claims cannot become verified by omission.
