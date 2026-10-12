# Malik Oil AI — verified first release

This is an analytical pilot foundation, not certified industrial software and not a claim that all 100 requested capabilities have shipped. No Render command, production request, paid provider call or deployment was used during development.

## A. Implementation

The existing Oil & Gas instruction on main is extended rather than replaced. The new `lib/work/petroleum/` modules implement:

- A domain/output router with a structured `petroleum.analyze` identifier. Domain expertise and the requested output format remain separate. Image, video, music, presentation and code commands retain their output intent. Negated generation instructions, cooking oils and oil paintings have regression cases.
- A monochrome SVG oil drop, searchable `@` menu, visible removable selection and keyboard/touch interaction in the Home and Chat/Work composers. Selection is forwarded in `ChatSendOptions`, the HTTP body and both persisted message records. The existing account-state merger retains the field; revival validates its identifier.
- Dimension-preserving stock liquid, standard gas, pressure, mass and time conversion. Gas requires an explicit temperature/pressure reference. No reservoir-barrel/boe equivalence, standard-condition change, density conversion or gauge/absolute pressure change is inferred.
- Water cut with mixed liquid rate units; GOR in scf/bbl at supplied gas reference conditions. Zero denominators return an undefined metric, not infinity or a fabricated zero.
- Exponential and hyperbolic Arps rate calculations with nominal decline in 1/day and `0 <= b <= 1`. Hyperbolic applicability must be explicitly attested in the typed task. Integrated volumes have independent numerical-quadrature tests. There is no automatic hyperbolic fitting, transient-flow model, terminal decline transition or reserves assessment.
- CSV/TSV and first-sheet XLSX production import, including Arabic/Persian digit normalization. A strict unit-bearing header contract avoids guessed dimensions and ambiguous dates. XLSX cached values are read; formulas/macros are never executed. Binary input is bounded to 4 MB; CSV to 20,000 data rows and 30 columns.
- Per-well history, first/last rate change, water cut/GOR trends, adjacent rate-change screening, data gaps, downtime availability and reported injection rate. Availability requires downtime and period hours together. Rate snapshots are never summed into cumulative production.
- OLS log-rate exponential fitting using actual elapsed days. At least six positive samples, declining slope and log-rate R² >= 0.8 are required. Zeros, anomalous changes, gaps and rejected input prevent the conditional forecast. Three decline scenarios use ±20% nominal decline; these are assumptions, not confidence intervals.
- Explicit periodic cashflows, NPV, bracketed IRR for conventional investment flows, fractional payback, break-even price and three price sensitivities. Currency and month/year period must be supplied. The financial model is pre-tax/unlevered and excludes royalty, FX, inflation, abandonment, financing and working capital.
- Same-basis stream balances and activity × supplied methane-factor calculations. Stream residual is unaccounted flow, not proven leakage. Methane factors and methodology must be supplied; no default emissions factor or GWP is invented.
- Versioned receipts with original-input SHA-256, method, variables, units, evidence classes, assumptions, uncertainty limitations and human-review requirement. User readings are explicitly unverified. Retain the original input file for replay; a fingerprint is not a backup of client data.
- Fixed technical report templates in AR/EN/RU/KK with the same computation results; existing interactive chart blocks display actual history and conditional scenarios. Full structured results are available from the skill API; the chat report explicitly limits displayed wells/history.
- Existing DOCX/PDF/XLSX/MD/JSON/HTML export infrastructure. Arabic HTML uses RTL; DOCX paragraphs/runs/tables and XLSX sheet views carry RTL metadata when Arabic is present. Petroleum Arabic PDF is deliberately refused pending shaping/layout validation, including through the generic exporter.
- The existing presentation server receives petroleum expertise plus actual deterministic receipts when structured numeric inputs are supplied. It still owns slide generation; no second answer or invented calculation is introduced.
- A deterministic advisory guard for detected urgent H2S/integrity/fire/leak situations and equipment-control requests. No field-device client, controller or equipment command is implemented.
- MENA scenario guidance for SA/AE/QA/OM/KW/BH/IQ without assigning geology, salinity, H2S, regulation or statistics from country alone. The existing live research path remains responsible for public/current questions.

The stream executes typed/narrowly recognized calculations and supported uploaded production tables locally before any model or multimodal provider. The receipt becomes one normal SSE answer. Input errors produce a truthful failed-calculation report. General domain questions without sufficient structured inputs stay with the existing text/model path under the evidence/safety contract. Natural-language numerical extraction is intentionally narrow: labeled water-cut values and periodic NPV flows with explicit rate/period/currency; all operations are available through the typed API.

### API examples

`POST /api/work/skills/run` uses the existing verified account context, bounded JSON reader, frequency budget and owner-scoped activity log. Bodies cannot select a different owner. Activity records include the input fingerprint but do not store raw production tables or provider secrets.

```json
{"skill":"petroleum.analyze","task":{"op":"npv","cashflows":[-100,60,60],"rate":0.1,"period":"year","currency":"USD"},"language":"en"}
```

For an actual file response add `"format":"docx"` (also PDF for non-Arabic, XLSX, MD, JSON, HTML). No download link is claimed before file creation. CSV upload in chat:

```text
@Malik Oil AI Analyze the attached production CSV.
gasReference: 60F 14.7psia
forecastMonths: 12
```

Required headers: `well_id,date,oil_bbl_day` or `oil_m3_day`. Optional headers: `water_bbl_day`/`water_m3_day`, `gas_scf_day`/`gas_sm3_day`, `injection_bbl_day`/`injection_m3_day`, and paired `downtime_hours,period_hours`. Dates must be ISO `YYYY-MM-DD`; ambiguous locale dates and Excel serial dates are rejected. Multiple unit columns for one phase are rejected. Reconcile/normalize per-column units explicitly before import.

## B. Engineering validation

Actual local checks on the implementation:

| Check | Result / scope |
|---|---|
| Petroleum suite | 162/162; includes independent numerical references, 15 named challenge scenarios, 55 distinct petroleum queries, 55 distinct other-domain queries, 22 mixed queries and adversarial input cases |
| Independent formulas | Barrel from 42 US gallons × 231 in³ × exact inch-to-metre definition; cubic foot from exact foot-to-metre; NPV direct discounted sum; IRR independent quadratic root; Arps volume compared with composite Simpson integration |
| Skill HTTP handler | Real handler exercised with explicit auth/storage/frequency fixtures; six real file formats, invalid schema, owner spoof rejection, throttling and existing math route |
| Streaming | Real stream HTTP/SSE handler with uploaded CSV in AR/EN/RU/KK; model/media/provider stubs throw if called; one answer and one completion; project flags cannot steal petroleum execution |
| Browser component | Real React mention hook/menu at 1280 px and 390 px; keyboard/touch, SVG, aliases, selection/removal and structured send; isolated fixture rather than a production account |
| History | Real account-state merger retains skill IDs and does not duplicate the same turns; existing memory-isolation and chat-stream tests pass |
| TypeScript / production compilation | `tsc --noEmit` and local `next build --webpack`; no Render used |
| Regression checks | Work mode, Work math (19/19), document writers (7/7), music intent, multimodal wiring, attachment menu, chat stream (11/11), account memory isolation, presentations (81/81), composer tools (22/22) |
| Broad release-core | Stops at six Markdown/automatic-photo failures in `test:answer-format`; the identical six failures reproduce on unmodified baseline main in a separate detached worktree |
| Local runtime | Node 24.19.0; repository targets Node 20–22. A dedicated PR workflow runs Node 22; its remote results must be reviewed before merge |

Measured V8 coverage from the 162-test run (not a claim of whole-product coverage):

| New module | Lines % | Branches % | Functions % |
|---|---:|---:|---:|
| units | 100 | 100 | 100 |
| reservoir | 100 | 94.59 | 100 |
| economics | 97.78 | 84.44 | 100 |
| production | 100 | 87.18 | 100 |
| engine | 100 | 85.19 | 100 |
| message | 98.31 | 77.05 | 100 |
| report | 100 | 84.48 | 86.36 |
| router | 100 | 97.37 | 100 |
| safety | 100 | 100 | 100 |
| schema | 100 | 100 | 100 |

The synthetic 100-well, 1,800-row production calculation took approximately 50 ms in one local test run. This excludes HTTP, storage, rendering and real-world latency; it is not a customer SLA or a validated large-table benchmark.

Statistical assumptions and data thresholds are screening rules; the tests do not establish field predictive accuracy, causal diagnosis, certified reserves, engineering approval or generalized zero routing errors. No calibrated probabilistic production interval is claimed. Forecast uncertainty remains conditional scenario sensitivity.

## C. MENA readiness

Immediately demonstrable: mature-well production screening, produced-water/GOR trends, reported injection/downtime, standard-flow balances, generic LNG/gas/oil periodic economics, supplied-factor methane screening and multilingual technical review reports. The synthetic demo is explicitly labeled and is not data from Saudi Aramco, ADNOC or any operator.

The background reference catalogue links public SPE PRMS 2018 v1.03 and the IPCC Energy/Fugitive Emissions catalogue (corrections through July 2023). The latter catalogue was retrieved on 2026-10-12. References are marked background, not live evidence or certification. No closed API/ISO standards are copied. No live search runs during local table computation. Current legislation, operator facts and contract claims require actually retrieved jurisdiction-specific evidence from the existing research pipeline; that production pipeline was not exercised against customer accounts here.

Arabic template language and numeric equality are tested; browser RTL metadata and OOXML direction support are implemented. Professional Arabic terminology, full-page mixed-script DOCX rendering and native-engineer linguistic approval remain unverified. Arabic PDF is unavailable rather than delivered with invalid layout.

Required client data: well identifiers, ISO timestamps, phase/rate definitions, stock/standard conditions, meter calibration and quality flags, operating/injection history, consistent downtime periods, intervention records, economic currency/period/volume definitions and optional uncertainty bounds. Pressure/PVT, geological logs, composition, water chemistry and laboratory results are needed before corresponding physical models can be implemented and validated. The user must retain source files for exact replay.

## D. GitHub delivery and deployment gate

Base inspected: `56adae6f3be5c472e2d55920f1dc1c70f76a7b46`.

Working branch: `codex/malik-oil-engine-20261012`. The final response records the delivered commit SHA and PR URL. Changes are prepared for review without a production deployment. The owner explicitly authorized main delivery after the local validation. Remote Node 22 checks, known baseline Markdown failures and unverified native-account scenarios remain disclosed limitations. The final response identifies the main SHA after a fast-forward update. `render.yaml` currently contains `autoDeploy: true`; it is unchanged. Render documentation confirms `[skip render]` suppresses the automatic deploy for that commit; no manual deployment is requested. All delivery commit messages include `[skip render]`.

No Render endpoint, manual deployment, production model/media call or paid integration was used. A local build is compilation only.

## E. Business readiness and next work

Offer a bounded, read-only engineering analytics pilot with an authorized petroleum engineer reviewing every material conclusion. Compare the same customer tables and manually approved calculations before/after. Agree KPI definitions before running the pilot: report preparation minutes, independent numerical tolerance, labeled-anomaly precision/recall, table processing latency, repeatability, Arabic review quality, data handling and actual processing cost. No financial savings, valuation uplift or contract is assumed.

Not implemented: all 100 target capabilities; local PDF/DOCX extraction/OCR; legacy XLS and multi-sheet/ambiguous-date auto-mapping; formation evaluation, OOIP/reserves classification, PVT/nodal/full reservoir simulation, robust hyperbolic fitting, EOR/chemical/corrosion/scale physical models, drilling NPT/failure-specific schemas, gas composition/LNG process simulation, refinery-quality/energy models, certified emissions reporting, regional regulatory connectors, corporate SSO/RBAC policy, air-gapped tenancy, formal penetration/load tests, calibrated field uncertainty, native Arabic expert review and complete live production regression. No equipment-control integration is planned for this release.

Next priority: an engineer-approved client data contract and a real legally supplied pilot dataset; then local document extraction, richer diagnostics/uncertainty and production-grade access/retention requirements. Fix the independent baseline Markdown failures before calling the whole product regression suite green.

### Reproduce

```bash
cd app/templates/sovereign-hub-ui
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run test:petroleum
npm run test:petroleum-api
npm run test:petroleum-stream
npm run test:work-docs
npx next build --webpack
```

Browser component QA requires an installed Playwright/Chromium runtime. `MALIK_QA_PLAYWRIGHT_PATH` and optional `MALIK_QA_CHROMIUM_PATH` select the executable dependencies without adding production packages. `PETROLEUM_DEMO_DIR` regenerates the synthetic demo outputs during `test:petroleum`.

## Complete changed-file list

- `.github/workflows/petroleum-engine-check.yml`
- `app/templates/sovereign-hub-ui/app/api/stream/route-impl.ts`
- `app/templates/sovereign-hub-ui/app/api/work/skills/run/route.ts`
- `app/templates/sovereign-hub-ui/components/sovereign/MalikMarkdown.tsx`
- `app/templates/sovereign-hub-ui/components/sovereign/chat-view.tsx`
- `app/templates/sovereign-hub-ui/components/sovereign/composer-tools/PetroleumMention.tsx`
- `app/templates/sovereign-hub-ui/components/sovereign/dashboard.tsx`
- `app/templates/sovereign-hub-ui/components/sovereign/hybrid/MalikHybridHome.tsx`
- `app/templates/sovereign-hub-ui/lib/ai/oil-gas-skill.ts`
- `app/templates/sovereign-hub-ui/lib/ai/reference-visual-policy.ts`
- `app/templates/sovereign-hub-ui/lib/ai/response-depth.ts`
- `app/templates/sovereign-hub-ui/lib/malik-god-router.ts`
- `app/templates/sovereign-hub-ui/lib/server/presentation-engine.ts`
- `app/templates/sovereign-hub-ui/lib/work/documents/docx.ts`
- `app/templates/sovereign-hub-ui/lib/work/documents/export.ts`
- `app/templates/sovereign-hub-ui/lib/work/documents/xlsx.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/economics.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/engine.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/knowledge.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/message.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/presentation.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/production.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/report.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/reservoir.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/router.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/safety.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/schema.ts`
- `app/templates/sovereign-hub-ui/lib/work/petroleum/units.ts`
- `app/templates/sovereign-hub-ui/lib/work/skills/registry.ts`
- `app/templates/sovereign-hub-ui/package.json`
- `app/templates/sovereign-hub-ui/scripts/verify-petroleum-api.mjs`
- `app/templates/sovereign-hub-ui/scripts/verify-petroleum-browser.mjs`
- `app/templates/sovereign-hub-ui/scripts/verify-petroleum-stream.mjs`
- `app/templates/sovereign-hub-ui/scripts/verify-petroleum.mjs`
- `app/templates/sovereign-hub-ui/scripts/verify-presentations.mjs`
- `docs/petroleum/IMPLEMENTATION.md`
- `docs/petroleum/PILOT.md`
- `docs/petroleum/demo/synthetic-100-wells.csv`
- `docs/petroleum/demo/synthetic-report-ar.md`
- `docs/petroleum/demo/synthetic-report.md`
