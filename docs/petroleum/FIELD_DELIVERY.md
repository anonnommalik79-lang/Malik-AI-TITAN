# Malik Oil — bounded field intelligence delivery

The owner stopped feature expansion and authorized main delivery of the completed slice. This is an analytical foundation, not all 15 phases, a physical digital twin, industrial certification or a replacement for petroleum engineers. No Render deployment is invoked. Existing UI components/styles are unchanged.

## Implemented

- New `field-surveillance` operation in the existing `petroleum.analyze` schema/engine, skill HTTP API and chat SSE route. Original production, reservoir, economics, documents and exports remain available.
- Branded field/reservoir/pad/well/equipment IDs; explicit parent/source mapping and constraints metadata. Unknown/cross-field parents and unmapped histories fail closed. No geology/equipment configuration is invented.
- Configurable historical median and MAD outlier screening for rates, water cut, GOR, downtime, pressure, power and lift efficiency. Same-well samples, gaps, age, missing values and pressure absolute/gauge basis are checked. Signals carry concrete input/method references, actual deviation, threshold/score, alternative explanations, missing information and review priority. No causation or probabilities inferred.
- Historical baseline uses prior samples only, rejecting insufficient, stale/gapped, drifting or unstable histories. Supplied references are labeled engineering assumptions. An uploaded loss request selects the screened historical method, not a guaranteed recovery rate.
- Snapshot rate gaps have rate units only. Declared calendar-average and operating-average data use actual Gregorian intervals, rejecting overlap and downtime-period mismatch. Baseline gap = capped downtime-supported estimate + unassigned gap. Plan deviation is separate; it is never added again.
- Explicit recovery scenarios with fraction/horizon, price and OPEX volume basis, currency, source statements, CAPEX and annual discount basis; reuse existing NPV/IRR. Water disposal requires an actual phase ratio. Prices/FX/fiscal inputs are not invented. Different currencies are retained separately, not summed or converted.
- Same-date group/field/reservoir/pad/portfolio subtotals with coverage; flow-weighted water cut. Missing phases/dates are not zero and stale rates are not included in current totals.
- Bounded async workflow: 500 wells, 20,000 history rows, 10 economic scenarios, 5-second calculation budget and two concurrent field executions per process. Progress is emitted in the existing activity block; cancellation/partial errors report actual counts. This is not a distributed durable worker queue.
- Additive `engineering` JSON contract from `/api/work/skills/run`: metadata, KPI directions, tables/history, formulas, scenario economics, evidence, warnings and uncertainty limits. Existing `malik-visual` chart blocks are reused; no competing visualization system. The field workflow does not invent a forecast; existing conditional decline operation is unchanged.
- Authenticated, owner-keyed immutable snapshots in the **existing** private object store, only with explicit import authorization and storage consent. Content/version hashes, cache reuse, access expiry (1–30 days), tamper checks and deletion. No unbounded in-memory dataset fallback and no automatic model/web transfer. Expired access is denied and deletion is attempted on read; physical lifecycle cleanup requires a storage lifecycle policy and is not automatically provisioned.
- Stable `log1p`/`expm1` Arps calculations avoid cancellation for very small decline/exponent. Receipt version incremented to `malik-petroleum-1.2.0`; field algorithm is `malik-field-1.0.0`.

## Verification scope

- Mandatory regression: oil decline 35%; WC 20/120 → 55/120; liquid 120 bbl/day in all eight rows; GOR 500 → 42000/65 scf/bbl. No cause for water increase is proved.
- New numerical/regression/property/load suite plus actual skill/snapshot/chat HTTP handlers use explicit auth/provider/storage fixtures. They are not live corporate-login or calibrated field trials.
- Prior petroleum core suite: 162/162 passed; six real export formats and existing skill handler passed.
- Latest recorded load (Node 22, local Windows, not Render): 500 wells / 6,000 rows ~176 ms; 500 / 20,000 ~546 ms, ~13.7 MB heap delta and ~120.2 MB whole-process RSS. One synthetic run each, excluding HTTP/auth/storage/UI; not an SLA or memory ceiling.
- Local production Webpack compilation, TypeScript and 84-page generation completed. Final tests/build results and delivery SHA are recorded in the final response. The generic release-core suite is not claimed fully green; the earlier baseline documents list independent Markdown failures.
- No TSX component, global style, navigation or element layout was modified. New chart data passed the existing chart schema. Full live/mobile/device visual verification is deferred; code inspection is not a claim of physical-device QA.

## Use through the existing API

```json
{"skill":"petroleum.analyze","language":"en","task":{"op":"field-surveillance","csv":"well_id,date,oil_bbl_day,water_bbl_day\nA,2026-04-01,80,20","rateBasis":"calendar-average","interval":"month","baseline":{"kind":"supplied","values":[{"wellId":"well:A","rate":{"value":100,"unit":"bbl/day"},"rationale":"Client-supplied reference for engineer review","source":"Client scenario, not a proven attainable rate"}]}}}
```

Result: observed 2,400 bbl; conditional reference 3,000 bbl; gap 600 bbl. Without downtime evidence the gap remains unassigned, not attributed to a specific failure and not guaranteed recoverable. Optional `format` uses existing exports.

Snapshot POST `/api/work/petroleum/snapshots`:

```json
{"task":{"op":"field-surveillance","csv":"well_id,date,oil_bbl_day\nA,2026-04-01,80"},"authorizedImport":true,"consentToConfiguredPrivateStorage":true,"retentionDays":7}
```

GET/DELETE use `?id=<returned SHA-256>` with the current authenticated session. The body cannot choose another owner. Missing private storage returns an explicit error; local analysis/download remains available.

## Remaining work, deliberately not hidden

P1: validated field forecast coupling, dated FX conversion, full time-structured fiscal cashflows, discounted payback, portfolio budgets/optimization and sensitivity exploration beyond supplied scenarios.

P2: material balance/volumetrics/PVT/nodal/waterflood/drive models and constrained optimization, with independent references and appropriate inputs. No pseudo-3D simulation is provided. [OPM Flow](https://github.com/OPM/opm-simulators) is a future external-simulator candidate; its official repository declares GPL-3.0 and publishes regression infrastructure. License/distribution review, field input decks and CPU/memory benchmarks are required before adopting it; it is not installed or validated here.

P3: organization-wide SSO/RBAC, dataset grants, calibrated uncertainty/anomaly accuracy on authorized operator data, retention lifecycle jobs, cross-instance job recovery, private-deployment/security reviews and full native-language/device validation.

Method sources: [NIST modified-Z/MAD](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm) was retrieved for the mathematical screening equation. [Energistics standards](https://energistics.org/the-standards) and [catalogue](https://energistics.org/product-catalog) were inspected as future interoperability references, not a conformance claim. SPE PRMS retrieval failed; no new source-verification claim is made for it.
