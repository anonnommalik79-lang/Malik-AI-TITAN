# Malik Oil AI: visual report (Claude part)

Status: implemented and tested locally on 2026-10-12. Not deployed: deployment is done by the founder.

## What it does

- A production table pasted into the chat as Markdown, CSV, TSV or `;`-separated text is computed locally. No model or provider is called. The answer is one `malik-oil-report` block.
- CSV, XLSX and DOCX uploads that go through the upload engine (`production.ts`) get the same visual report. The engine's protocol stays in the answer, collapsed under `<details>`.
- If units or a per-day basis are missing, the answer asks for them. Units are never guessed.
- The browser recalculates every number from the validated inputs. Stored metrics are only compared with the recalculation: a changed number is shown with the engine's value and a warning.
- The upload engine is re-run as an independent cross-check. The report says whether the two agreed.

## Contract (`lib/work/petroleum/analysis-contract.ts`)

- The Zod schemas are `PetroleumAnalysisRequest`, `PetroleumAnalysisResult` and `OilReportBlock`.
- The request carries validated series only, in declared units: `bbl/day`, `m3/day` or `t/day` for liquids, and `scf/day` or `sm3/day` for gas.
- The result has the Phase 9 fields:
  - `sourceSummary` and `validatedInputs`;
  - `calculatedMetrics` and `analysisSections`;
  - `chartSeries` and `tableDatasets`;
  - `formulaDefinitions`, `modelOutputs` and `economicOutputs`;
  - `qualityFlags`, `warnings` and `limitations`;
  - `provenance` and `engineVersion`;
  - `wells`, the per-well detail.
- Text is language-neutral: codes plus numbers. The report translates the codes to RU, EN, KK or AR, so a translation cannot change a value, a unit or a formula.

## Analytics (`lib/work/petroleum/analysis.ts`)

The first six reproduce the reference report:
- engineering conclusion;
- KPIs;
- oil, water and liquid rates;
- water cut;
- GOR;
- actual versus scenarios, and the table.

Fifteen more:
1. WOR.
2. Liquid stability (CV).
3. Decline rate per period and effective annual.
4. Comparison of linear, exponential (b=0) and harmonic (b=1) models by R² and RMSE.
5. Period-over-period changes.
6. Anomalies: jumps of 30 % or more, gaps, zero rates, robust-z outliers.
7. Data quality.
8. Cumulative production over calendar days.
9. Gas.
10. Oil–water balance.
11. Hypotheses with the measurements that tell them apart.
12. Well ranking and field total.
13. Economics, only when a price is stated.
14. Chan WOR screening.
15. Formulas with substituted values.

Scenarios are clamped at zero. They are labelled as trend continuation, not a reservoir forecast, and not as confidence intervals.

## Golden benchmark (Phase 4)

| Metric | Result |
|---|---|
| Oil decline | 35 % |
| Water cut | 16.6667 % → 45.8333 % (+29.1667 pp) |
| GOR | 500 → 646.1538 |
| Liquid rate | 120 bbl/day every month |
| WOR | 0.2 → 0.846 |
| Linear trend | 60 / 55 / 50 bbl/day |

Water cut, GOR, liquid rate and WOR are checked for every month. The linear trend reaches zero in Sep 2027.

## Checks

- `npm run test:oil-report`: 50 tests.
  - The golden benchmark.
  - The contract and replay.
  - Tamper detection and the cross-check.
  - 34 input and engineering scenarios.
  - The four languages.
  - The real `/api/stream` handler, where model and provider stubs throw if called.
  - Server rendering.
- `npm run test:oil-report-live`, with a running app and Playwright: 390 and 1280 px.
  - The report fits the screen and stays strictly black and white.
  - Hover and touch values, legend toggles, well tabs, «Развернуть все», copying the table and CSV download all work.
  - Arabic is right-to-left.

## Not done yet

- Ten engineering domains from the V3 brief belong to the engine and not to the report: PVT, volumetrics, pressure and well tests, WITSML/PRODML/RESQML, tenancy and roles. Of the twelve domains, only production history and economics against a stated price are covered.
- Native-speaker review of the Kazakh and Arabic engineering terms.
- The report's PDF/DOCX export uses the text version (`oilReportBlocksToText`); the charts are not in it.
