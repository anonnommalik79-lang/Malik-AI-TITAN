# Malik Oil contextual-units repair — synthetic acceptance record

Source baseline: `e8903ec45c674cbf195cdbd7820935db08fb2d6e`. No rollback of main.

## Root cause and changes

`table-input.ts` searched for generic liquid-rate declarations and did not bind `Oil = STB/day` or `Water = bbl/day` to their columns. The stream returned the resulting `UNITS_MISSING` question before deterministic computations or provider requests.

The repair binds contextual units to individual roles, detects conflicting declarations, retains partial safe calculations, separates reservoir volumes and unspecified gas conditions, parses all production tables, and accepts scalar-record JSON with explicit unit metadata. Pwf is retained and normalized to psi, without inferring absolute/gauge datum or reservoir pressure. Explicit dataset JSON is no longer dispatched as an unknown petroleum operation. Failed unitless-header CSV/XLSX imports retry the same contextual parser, including visible worksheet unit cells. Excel comments, hidden sheets and custom properties are not supported by the existing reader.

The deterministic engine independently verifies raw-data sum/ratio identities before publishing the report. Execution stages are emitted by actual code. Petroleum analysis bypasses the scheduler. Model output is buffered into one answer; provider failures preserve computed evidence and graphs. Ensemble checks reject malformed/error/quota bodies, enforce named participant identity, and bound participant and synthesis deadlines. Model drafts are still proposals, not proof of numerical consensus.

## Reproduction and acceptance

Run from `app/templates/sovereign-hub-ui`:

```bash
npm ci --legacy-peer-deps
npm run test:petroleum-context
npm run test:oil-report
npm run test:oil-ensemble
npm run test:petroleum
npm run test:petroleum-field
npm run test:petroleum-api
npm run test:petroleum-stream
npm run test:petroleum-documents
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs --test scripts/verify-oil-investor-30.mjs
npm run typecheck
npm run build
```

The original 24 rows are in `scripts/fixtures/oil-six-wells.mjs`. Expectations are independently computed from those raw rows in `verify-petroleum-context.mjs`, including WC, WOR, GOR and field aggregation at every supplied period. HTTP/SSE tests execute the real `/api/stream` handler in Chat and Work with explicit authentication, provider and storage fixture boundaries. They do not claim live provider or deployment verification.

| Synthetic control | Result |
|---|---:|
| January field oil | 4000 STB/day |
| October field oil | 3240 STB/day |
| Oil decline | 19.00% |
| January water | 1130 bbl/day |
| October water | 2070 bbl/day |
| January field water cut | 22.03% |
| October field water cut | 38.98% |
| W-04 October water cut | 61.40% |

Stock-tank barrels and surface barrels use the exact barrel-volume conversion, with conditions checked. Reports normalize compatible liquid rates to bbl/day. A rate sum is never a cumulative volume. The yearless Jan/Apr/Jul/Oct snapshots do not establish cumulative production. NPV/IRR and investment performance cannot be computed from these 24 production rows alone.

## Visual audit and limits

`docs/visual-intelligence-100-audit.csv` enumerates every catalog entry: **6 tested cores and 94 specifications**. These are not 100 independently implemented engineering tools. This repair adds factual Water Cut heatmap and pressure datasets/components without inflating the catalog status.

Data-backed report capabilities: oil/water/liquid history, gas trend, water cut, WOR, GOR, multiwell comparison, field KPIs, oil rate heatmap, Water Cut heatmap, pressure trend and conditional decline forecasts. Forecasts are statistical scenarios, not verified reservoir forecasts or confidence intervals. Interactive/mobile behavior requires browser verification; static component rendering alone is insufficient.

The requested production-loss cause waterfall, intervention effectiveness, economic contribution, investment scenarios, NPV sensitivity, hazard probabilities/risk matrix, optimal well priority, scenario decision tree, intervention comparison and engineering process modeling remain limited or require additional explicitly supplied inputs. Existing deterministic economics implements periodic NPV, IRR for conventional flows, undiscounted payback, gross cash flows and ±20% price sensitivity; numerical tests do not imply that the six-well prompt supplies economic assumptions.

## Malik Work and readiness

The browser runner is a separate service requiring `MALIK_COMPUTER_USE_URL` and a matching `MALIK_COMPUTER_USE_TOKEN` of at least 32 characters. A browser panel alone is not an executed browser task. Authorized GitHub operations use the signed-in user's Pipes GitHub credential; server `GITHUB_TOKEN` is deliberately not substituted. Writes additionally require `WORK_CONFIRMATION_SECRET` or `WORKOS_COOKIE_PASSWORD` and durable confirmation storage.

Synthetic acceptance supports a bounded engineering demonstration. Industrial deployment requires authenticated provider/tool checks, validated real field data, PVT and reference conditions, security/availability review, and petroleum-engineer validation. Do not represent this test as an Aramco/ADNOC deployment or certification.

## Production-audit follow-up

The first live repaired ensemble response passed all production calculations but added an unsupported profitability horizon without prices or costs. `interpretation-policy.ts` now withholds numerical economic claims from model interpretation; only validated calculation receipts can provide economic numbers. Its bounded language filter is not a general proof of all narrative statements. Production reports are streamed before waiting for models, with one authoritative completion and without duplicate report blocks. Regression tests hold a model call pending and verify that the closed report is already delivered; the unsupported live profitability sentence is tested verbatim.
