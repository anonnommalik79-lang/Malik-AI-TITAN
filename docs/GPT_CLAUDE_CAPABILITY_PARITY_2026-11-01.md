# MALIK AI: GPT + Claude capability parity — 2026-11-01

## Scope and honest status

Goal: match the **user outcomes** of excellent AI products using licensed APIs and Malik's own software. This does not duplicate OpenAI/Anthropic's weights, training data, internal prompts, private tool backends, subscriptions, or guaranteed model intelligence. A paid ChatGPT or Claude subscription does not pay for the corresponding API.

This branch is **Phase 0 of a longer parity program**. It does not change `app/api/stream/route-impl.ts`, the chat layout, main branch, production configuration or billing policy. No claim of feature parity is made.

### Current repo evidence

- Primary chat entry: `app/api/stream/route.ts` delegates to `route-impl.ts`, which calls `lib/malik-god-router.ts` / `lib/server/malik-model-router.ts`. **It is not simply the native `lib/ai/providers/openai.ts` adapter.**
- Auxiliary AI provider router: `lib/ai/router.ts` → `providers.ts` → native provider adapters. Their usage must be verified per individual route.
- Existing code includes chat SSE recovery, a research engine, citations/fact audits, website/game studio, project artifacts, quota logic, account chat persistence, connectors, scheduling, and work mode.
- Existence in source code is not proof that authenticated production scenarios work. Prior audit explicitly marked many end-to-end scenarios UNVERIFIED.

### Capability map: product layer vs model layer

| Capability | GPT / Claude approach | Malik development task | Acceptance evidence |
|---|---|---|---|
| Reasoning | Native model reasoning/effort | Correct per-provider API, adaptive cost/latency strategy | Simple/deep questions and response token receipts |
| Conversations | History + model context | Durable chat state with scoped summaries, no silent dropped system rules | Cross-session continuity and deletion tests |
| Research | Web search and source retrieval | Fetch sources, distinguish snippets vs read pages, grounded citations | Freshness and source-audit tests |
| Coding | Agentic repository editing | Workspace snapshot → plan → diff → tests → preview → approval → commit | Multi-file build and tests from a clean checkout |
| Websites | Artifacts and preview | Sandbox preview, visual QA, device sizes, edit/revision loop | Mobile/desktop screenshots and production build |
| Documents | Editable document workflows | Real DOCX/PDF/PPTX/XLSX export tools, templates and QA | Valid downloaded file opened by independent reader |
| Vision | Multimodal input | Actual image input, bounded size and privacy policies | Vision fixtures with distinct images |
| Audio | ASR/voice/TTS | Real-time audio, interrupts, consent and quotas | Speech interruption/latency/permission tests |
| Media | Image/video models | Dedicated providers, job IDs, polling, billing, provenance | Real output plus provider receipt |
| Agents | Tool calls with approvals | Typed tools, sandbox, least-privilege scopes, no hidden side effects | Approved/denied/replayed-action tests |
| Connectors | MCP/apps | OAuth scopes, secure account isolation, revocation | Unauthorized cross-account attempts blocked |
| Memory/projects | User-controlled memory | Consent, scope, citations, erase/export | User can inspect/delete project context |
| Parallel work | Multi-step agents | Bounded job queue, idempotency keys, cancellation, visible real events | Retry/cancel with no double charge |
| Personalization | Preferences/instructions | Stable opt-in, transparent precedence | Preference survives reload; user can override |
| Safety | Guardrails and approvals | Prompt-injection separation, SSRF protection, secret redaction | Adversarial tool/output tests |
| Quality | Reliable delivery | Evals, factual checks, fallback only when justified | Repeatable scorecard, not model self-rating |
| Economics | Smart model selection | Capability matrix, provider health, cost ceilings, caching | Per-request model/cost receipt, no surprise API calls |

## Phase 0 — implemented in this branch

1. Native OpenAI adapter sends GPT-5/GPT-6 models to the **Responses API**, while older GPT-4.x keeps the Chat Completions path.
2. The Responses request uses `store:false`; optional `metadata.reasoningEffort` is allowlisted. It does **not** forward legacy `temperature` to GPT-5/GPT-6 reasoning models.
3. Native Anthropic adapter supports modern Claude 5 adaptive thinking and optional effort; aggregates **all** system messages rather than dropping later ones.
4. Both adapters explicitly reject no-text / unfinished responses instead of labelling them successful answers. Tool-only responses are **not** executed by this text adapter.
5. The default Anthropic *auxiliary provider* alias is modern `claude-sonnet-5-5` instead of the stale Claude 3.5 alias. GPT default is unchanged to avoid unapproved spend.
6. Added offline deterministic contract tests `npm run test:gpt-claude-native`.

**Not part of Phase 0:** tool loops, streaming, multimodal input, image generation, browser/computer control, model-selector changes, implementation inside the primary chat route, or automatic premium-model routing. The existing code and available keys are not a free entitlement to closed-source models.

## Model configuration (opt-in)

Configure keys securely in the server secret manager; never commit them:
- `OPENAI_API_KEY`: direct OpenAI API.
- `ANTHROPIC_API_KEY`: direct Anthropic API.
- `OPENAI_MODEL=gpt-6.1-sol` and/or `OPENAI_CODE_MODEL=gpt-6-astra` for the *auxiliary provider router*, only when approved and budgeted.
- `ANTHROPIC_MODEL=claude-sonnet-5-5` and/or `ANTHROPIC_CODE_MODEL=claude-opus-5-5` for the *auxiliary provider router*, only when approved and budgeted.
- `metadata.reasoningEffort="low"|"medium"|"high"|"xhigh"|"max"` is optional, not a blanket quality guarantee; supported ranges can differ by model.

As of 2026-11-01 reference rates per 1M **uncached** tokens: GPT-6 Astra $10 input/$50 output; Claude Opus 5.5 $4/$20. Output, reasoning, tool calls, long contexts and other charges may apply. Verify live pricing before enabling.

## Next implementation phases — no premature “all done”

### Phase 1: main-chat architecture and receipts (highest priority)

- Trace actual `route-impl.ts` and `malik-god-router.ts` execution paths, not feature labels. Establish call graphs, account/permission boundaries and model-selection behavior with focused tests.
- Define `ProviderCapability` registry: modalities, tools, output limits, live availability, supported effort, API endpoint, pricing, quota, region and privacy configuration. Unsupported combinations must be rejected early.
- Unify provider-error taxonomy, incomplete-output detection, abort propagation, real token telemetry and idempotent retries.
- Add authorized direct GPT/Claude routing to primary chat **only after** rate/billing/plan policy and UI model selection are reviewed.

### Phase 2: tool-using intelligence

- Implement typed tool-execution loop with bounded steps/time/cost, verification, per-tool permission grants and genuine receipts.
- Sandbox generated code; never execute arbitrary assistant-produced shell commands on the production host.
- Build source-aware research: retrieval → read → evidence ledger → synthesis → contradiction handling → citation verification.
- Add model-independent regression suite and gold task set on Russian, Kazakh and English.

### Phase 3: engineering and artifacts

- File-system agent: branch snapshots, multi-file diffs, package install allowlist, tests, static analysis, isolated build/preview, reversible commit.
- Preview pane with project file tree, errors, real device screenshots, iteration controls and version history. Preserve current UX; use feature flags for additions.
- Real documents/spreadsheets/presentations with downloadable, validated files rather than Markdown pretending to be those formats.

### Phase 4: scalable product

- Persisted task/job queue and restart recovery, quotas and billing ledger.
- Secure OAuth/MCP connectors with user approval; scoped memory and delete/export controls.
- Observability: real provider success %, cost per completed task, median/p95 latency, factual quality, test pass rate and failure reasons.
- Controlled rollout: local tests → staging → pilot accounts → production after explicit owner approval.

## Mandatory acceptance matrix

Run at least: short chat; long context; two system messages; reasoning with exact arithmetic; current web claim with citations; forced 429/401/502; abort/stop; duplicate reconnect; two accounts; image analysis; long code output; 10-file project edit; runnable webpage; broken build recovery; forbidden tool call; explicit tool approval; file download; quota exhaustion; key-missing fallback; mobile viewport; mixed Kazakh/Russian text.

Each case records PASS, FAIL, BLOCKED or UNVERIFIED with actual logs. Never infer that a named “superpower” means an executable backend exists.

## Official reference documentation

- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://platform.claude.com/docs/en/models/overview
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works
- https://www.anthropic.com/claude-opus-5-5
