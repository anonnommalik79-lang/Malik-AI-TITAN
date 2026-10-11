# Malik Accuracy Engine — measured validation

2026-10-11. Feature branch: `codex/malik-accuracy-engine-20261011`.
Baseline: `fc9222c8f742853be97b275736c54cfb1a6b5bcf`. See [pre-change audit](accuracy-engine-audit.md).
No Render commands, deployments, main changes, new dependencies or API keys.

## Implemented, beyond a system prompt

- Reused the existing BigInt rational engine for exact decimal arithmetic, percentages, explicit rounding, precedence, fractions and same-dimension conversions. Binary float tolerances no longer hide one-cent errors. Unsupported expressions are not evaluated as JavaScript. Division by zero and incompatible dimensions are withheld.
- Added bounded compound-interest, per-period annuity, NPV and percentage-change functions. Recognized annuity/compound requests inject actual computed receipts into the selected model's context. NPV/percentage-change helpers are tested, but arbitrary natural-language financial models are not automatically parsed.
- Shared MAU → paying → revenue dependencies distinguish ARPU from ARPPU. Rows are recalculated independently; a single unambiguous profile can reconcile its conclusion before or after the table. Different periods/scenarios are not merged, annual revenue is not confused with MRR, missing FX is not invented. Inline code in another table column does not disable numeric-cell checks.
- Classified explicit user data, calculations, external claims, assumptions and forecasts. Pure verified calculations do not demand web citations; external claims alongside them still do. Scientific quantitative estimates lacking actual input quantities or matching sourced quantities are withheld. A mention of a formula or the same number with a different dimension is insufficient.
- Added real finalization to selected chat/plugin/attachment/coder paths and the God router. At most two deterministic passes; zero verifier-model retries. The SSE final event exposes a scoped accuracy report. Existing cancellation, persistence, provider selection and accounting remain in place.
- Ordinary prose and code still stream. Risky numeric/scientific answers are held until checked, while execution/heartbeat events remain live. Unexpected numeric content stops further prose deltas until the final snapshot. This trades first-answer-text latency for pre-emission consistency; it is not a claim that every answer arrives faster.
- Shared explicit media intent now gates the UI, task/provider classification and automatic skills. Negative commands, scientific explanations, quoted examples, tutorials and tool comparisons stay text. Direct generation, uploaded-pixel edits and quoted lettering remain supported.
- Markdown tables preserve escaped/code/math pipes. Inline `\[...\]` renders as display math; TeX size/depth/work are bounded. Math scrolls locally; existing table controls and overall layout remain unchanged.

## Reproducible tests

Run from `app/templates/sovereign-hub-ui` with Node 22:

```text
npm run test:accuracy
npm run test:accuracy-routing
npm run test:accuracy-browser
npm run test:truth
npm run test:fact-audit
npm run test:answer-format
npm run test:image-edit
npm run test:superpowers
npm run test:reference-intent
npm run test:work-math
npm run test:chat-stream-integrity
npm run test:memory-isolation
npm run test:chat-audit-contract
npm run test:release-core
npm run typecheck
npm run build
```

Browser QA requires Playwright/Chromium, or the documented environment overrides in its script. It bundles the actual Markdown/TeX React components; unused ZIP and interactive-JSON boundaries are stubs, covered separately by existing suites. It is not an authenticated dashboard/live-provider test.

## Confirmed results

| Measurement | Result | Scope |
| --- | --- | --- |
| New regression assertions | 125/125 PASS | Deterministic gold fixtures, not live models |
| Deliberately erroneous gold responses | 25/25 detected and corrected (100%) | Small, explicitly supported expression set |
| False warnings | 0/24 (0%) | Known-correct fixtures only |
| Production router fixtures | 7/7 PASS | Actual router; provider/connected-service boundary stubs; includes English financial outputs |
| Component browser checks | 3/3 PASS | Chromium 1440, 390 and 360 px; formulas, 8-column table, scrolling, no page overflow |
| Local verification latency | p50 0.754 ms; p95 1.537 ms | 120 repeated 25-error answer checks on Windows/Node 22 |
| Additional verification model calls/tokens/provider fee | 0 / 0 / $0 | Deterministic verification only, excluding the normal answer call and added instruction tokens |
| Test process heap / RSS | 13.23 / 78.62 MiB | Whole local test process, not incremental per-request memory or Render utilization |
| Scoped ESLint | 0 errors, 83 warnings | Changed files; existing warnings were not broadly refactored |
| Production compilation | PASS | Next.js 16.2.7 / Webpack, isolated QA copy, 84 static pages |
| Standalone TypeScript | PASS | `tsc --noEmit --incremental false` after final build |
| Existing core release suite | PASS | Full suite on original baseline; local fixture/static suites, no deployment |
| Truth, fact audit, format, reference/edit, skills, brain, Work math | PASS | Existing regressions; not a live API guarantee |
| Stream integrity / memory isolation / audit contract | PASS | 11 transport and 9 audit contracts plus account-memory fixtures |

The original checkout has stale dependency/type artifacts. Validation used an isolated source copy with cached dependencies and no `.env.local`. Default Turbopack rejects its external `node_modules` junction; local production compilation passed using `next build --webpack` without changing the committed Next configuration. Linux/Turbopack CI still runs the normal build after the PR opens; its result is not yet a confirmed local result.

During work, remote main advanced to `c3e504b89623bae58cb250c430a7c78f75826bdf`. These owner changes were integrated into the feature branch, not the reverse. The overlapping negative-media-verb fix is preserved together with quote/discussion guards. Post-integration verification passed: 125 Accuracy fixtures, 7 router fixtures, image edits, the expanded Markdown renderer, Stage B (25 checks), Stage C, request-motion keeper, stream/fact contracts, desktop/mobile component QA, production compilation, standalone TypeScript and scoped lint. One quota fixture initially hit Windows sandbox `EPERM` on a temporary atomic rename; the authorized local rerun passed without changing quota behavior. Main and Render were not written by this task.

## Remaining limitations / follow-up evidence

1. These rates do **not** measure arbitrary model-answer correctness. No paid/live-provider quality, end-to-end auth flow, production latency, total token cost or Render-memory benchmark was run. Added system-instruction tokens can affect the ordinary answer's cost, even though verifier calls cost zero.
2. The original three reported transcripts were unavailable. Boxes/train, MAU/conversion and unicorn fixtures are representative reproductions. General logical reasoning, scientific models and causal assumptions are not proven by this narrow calculator. Only simple total-count/constant-speed word problems are recognized; ambiguous or changing premises remain with the model.
3. Source number/unit matching is not semantic entailment, source authenticity or scientific validation. A correctly calculated formula may still be the wrong model of reality. Explicit assumptions and forecasts remain conditional, never guaranteed outcomes.
4. Recognized financial labels and periods are conservative. Multiple scenarios, taxes/fees, annual-to-period rate conversions, cross-currency results and unsupported unit conversions are not guessed. Ambiguous comma forms such as `1,000` are rejected rather than silently choosing decimal versus thousands.
5. Verification scans at most 60,000 characters / 800 lines, with 32 issues and 48 provenance entries. An untouched tail is marked `limited`; overlong lines, protected quotes/code and unsupported notation are not a proof. Reporting `checked` means only recognized claims were checked, not that an entire response is true.
6. Real-device Safari/iPhone/Android and full-dashboard visual regression still need device testing. Local Chromium viewport checks confirm the changed formatting components, not every app screen.

No 100% universal-accuracy promise, hidden chain-of-thought display, model fan-out, main merge or Render launch is part of this change.
