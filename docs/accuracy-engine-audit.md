# Malik Accuracy Engine — audit before implementation

Base: `fc9222c8f742853be97b275736c54cfb1a6b5bcf`, 2026-10-11. No deployment changes.

## Request path and confirmed causes

1. `app/api/stream/route-impl.ts` selects chat, attachments, plugins or project build; emits SSE deltas and a final result. `lib/malik-god-router.ts` supplies evidence, instructions and model selection. `lib/server/malik-model-router.ts` / `malik-max-engine.ts` own provider selection, budgets and continuation. These must remain the production transport, not be replaced by another SDK.
2. `lib/work/math/{intent,engine,sandbox,rational,model-plan}.ts` already provides bounded symbolic math and units. Direct detection deliberately excludes prose word problems. Model-planned formulas are Work-only and prove the formula, not its correspondence to the question. `rational.ts` already uses BigInt, but truth auditing does not.
3. `lib/ai/truth-engine{,-v2}.ts` uses binary floating-point arithmetic and a mismatch allowance of at least one whole unit. This misses decimal/money errors. The finalizer prefixes a warning and then sends the entire erroneous draft. Buffering requires both digits and a small list of calculation verbs: forecasts, logical and scientific responses can bypass it.
4. Headline consistency checks only salary/employer amounts. There is no shared MAU → paying users → revenue dependency graph or row/summary reconciliation.
5. `lib/ai/fact-audit.ts` matches numbers against source snippets or prompt values. It does not distinguish a derived calculation, forecast or assumption from an external fact. Numeric occurrence is not semantic proof of a claim; this limitation must remain explicit.
6. `lib/ai/image-intent.ts` is shared by UI/reference routing but matches creation verbs/nouns anywhere in text. Negated requests and quoted examples are not consistently excluded. Separately, `lib/ai/detect-task.ts` uses noun scores and broad creation substrings (`сгенер...` also matches a negated request). This feeds `brain-v1.ts`, `brain.ts`, the provider router and rate-limit categories; a real-router fixture reproduced `task:image` for the scientific unicorn explanation. `superpowers.ts` also independently infers media skills. Shared explicit media consent must gate all these paths, not just the dashboard.
7. `components/sovereign/MalikMarkdown.tsx` splits table rows on every pipe, including escaped pipes and pipes inside code/math. `malik-tex.tsx` recursively parses unrestricted formula depth/length. Wide table scrolling already exists; preserve it, repair parsing and constrain math overflow locally.

## Implementation boundaries

Exact bounded decimal/rational checks, structured provenance, conservative recognized financial dependencies, a bounded repair gate, no new paid provider fan-out. Preserve code fences, source integrity, usage accounting, cancellation and existing model/transport. Never claim free-form reasoning or scientific hypotheses have been proven by a calculator. Unknown/ambiguous models stay unverified.

Original reported boxes/train and MAU transcripts were not supplied in this task. Regression fixtures will be representative reproductions, not claims of replaying those missing transcripts. Fixture correctness and timing are not live model accuracy or production latency.
