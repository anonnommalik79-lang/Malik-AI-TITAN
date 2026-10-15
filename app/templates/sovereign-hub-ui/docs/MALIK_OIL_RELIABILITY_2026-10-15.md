# Malik Oil query reliability — 2026-10-15

Base: `dce2e2ac764f0e3b905bbbcfa8115987815f8eda`. Algorithm receipt: `malik-petroleum-1.4.1`.
The existing 100 catalogue entries describe bounded numerical scopes, not 100% correctness on arbitrary requests, field certification, or a complete petroleum enterprise platform.

## Reproduced defects and fixes

1. **A file changed the requested operation.** A fully specified `method=waterflood` plus a CSV executed `production` instead. The async loss-keyword route, PDF/DOCX extraction, and contextual CSV fallback could also preempt the calculation. Explicit task plus attachment now returns `ATTACHMENT_TASK_CONFLICT`, requests separate submissions, and executes neither operation. Ordinary file-only analysis remains available. No attachment is silently ignored and no file parameters are guessed.
2. **Cancellation survived the numerical audit.** With price `1000000000000000`, variable expense `999999999999999.9`, two unit-volume periods and zero discount/CAPEX/fixed expense, both implementations accepted NPV `0.25` instead of canonical-decimal `0.20`. Cash-flow construction now uses integer decimal coefficients; the independent audit subtracts full decimal revenue and expenses at a common scale. This applies to scenario comparison, seeded Monte Carlo cash flows and legacy economics. Discounting, IRR and stochastic draws remain floating point. Digits already lost before JSON parsing cannot be recovered.
3. **Valid shorthand was rejected.** Explicit SI scalar forms `.2`, `+.8` and `1e-3` now parse without a model. Ambiguous locale separators, nonfinite values, unlabelled physical parameters, unknown keys and missing applicability confirmations are still rejected.

Repeated volume amounts are reused within a cash-flow evaluation, with a request-local bounded cache; no cross-user state or unbounded global cache was added. The existing 10,000-draw × 60-equal-period fixture with independent audit measured 617 ms locally after optimization. This is a specific fixture, not an end-to-end chat latency guarantee or a benchmark for every volume history.

## Regression evidence

- Before fixes, the initial targeted suite had 14 failures out of 19 cases, reproducing attachment substitution, scalar parsing and decimal cancellation.
- After fixes, 27 new targeted cases and 229 existing advanced cases passed: 256/256.
- Other science/catalogue/context/report suites: 1372/1372.
- Core petroleum, field and native-document suites: 247/247 (serial test runner).
- Actual `/api/stream` handler: all 61 science methods, ordinary CSV/DOCX/PDF handling, four explicit-task/file conflicts (CSV/XLSX/PDF/DOCX), one SSE completion and no model/media fallback; RU/KK/EN/AR exercised.
- Actual skills handler: all science methods and real DOCX/PDF/XLSX/Markdown/JSON/HTML export paths; Arabic PDF remains an explicit refusal rather than broken glyphs.
- Accuracy Engine: 125/125 recognized deterministic fixtures; MAX routing: 37/37 provider fixtures. These do not measure live model answer accuracy.
- Work runtime and public GitHub boundaries: 15/15 and 5/5, using real handlers/executor/exporters with explicit authentication, GitHub HTTP and model fixtures; no live repository writes or execution sandbox certification.
- UI/hosting source freeze passed against the base above. No component, CSS, asset, auth, navigation, Render or deployment configuration changed.
- Targeted ESLint on all nine changed petroleum TypeScript modules: exit 0, no warnings/errors.

The counted deterministic suites total 2037 passing cases (1628 + 247 + 125 + 37); handler integration assertions are additional, not included in that number.

The first local streaming attempt failed at the native PDF metadata boundary; it was rerun with native-tool permission and passed without weakening assertions or changing PDF validation.

The base commit's Production build check workflow was already red before these changes: job `116015683298`, step `Live intelligence fixtures and router acceptance`, stopped at `ReferenceError: runSiteForgeTurn is not defined`. The AST-based lane harness now explicitly isolates the newer Site Forge and Analyst branches and injects the real computed-evidence instruction helper. Its seven existing assertions are unchanged and pass. Separate real-handler Site Forge/Analyst fixture suites also pass (25 cases). This is a test-harness repair, not a change to application routing or a claim that the full remote CI run has completed.

Standalone TypeScript typecheck: exit 0. Full Next.js 16.2.7 production build: exit 0, including compilation, TypeScript, 84/84 static pages and final build traces. The QA copy's 59 new/changed source files matched the working tree by SHA-256 before the build; subsequent edits were test-harness/report-only, not runtime code.

## Remaining boundaries

Authentication, quota, provider and storage boundaries in handler tests are explicit fixtures. No fake session or auth bypass was introduced. A production `waterflood` response supplied by the user verifies that one live calculation, not every scenario. A fresh signed-in browser-to-production run is not established here; local WorkOS configuration previously lacked a client ID/API key. This is not evidence that production registration is broken.

No live provider benchmarking, field calibration, measurement provenance certification, OCR, physical iPhone/Android validation, or persistent enterprise storage is claimed. Missing data and assumptions remain visible. Render is not launched.
