# Malik Oil — scientific compute extension

Scope: existing petroleum chat/skill/API/export path, no page, layout, navigation, global CSS or authentication changes. No Render deployment. No new dependency or paid provider.

## A. Audit and causes

The previous release had 26 executable catalogue capabilities, concentrated in production/DCA, explicit economics and homogeneous OOIP. An LLM narrative could not supply the missing executable scientific kernels. This extension adds a closed, typed `scientific` operation before the existing model/generator path. F51–F60 catalogue names were misaligned with the original mission (combined viscosity shifted Z/density); they now preserve the exact mission IDs, with unsupported viscosities still disabled.

## B. Actual execution

`science-schema.ts` → `science.ts` → `science-verify.ts` → existing `PetroleumReceipt` → `science-report.ts` → existing Markdown/Visual Engine and document export. The validator does not import/re-run the calculator. It checks physical identities, source/result consistency, units, provenance, metrics, table cells and curve coordinates. Invalid tasks fail closed. Generated shell/code, extra keys, guessed units and arbitrary methods cannot execute. User/synthetic input provenance is never promoted to a verified field measurement.

All new operations are bounded (120 curve/interval/allocation points; backtest 240 history points, at least four training/two holdout). Ordinary chat and existing model interpretation remain unchanged. New computations make zero model/network calls. SHA-256, algorithm version, duration and numerical-check count accompany the receipt. CPU time is measured locally, not a production latency SLA.

## C. Catalogue: 51 / 100 numerical scopes

26 previous scopes + 25 new scopes through 23 methods. `IMPLEMENTED & VERIFIED` means synthetic numerical/schema/route tests within the stated scope, **not** empirical reservoir calibration, scientific certification, commercial-simulator equivalence or product completeness. Other 49 entries remain `NOT IMPLEMENTED` and cannot execute a fabricated fallback.

| IDs | Method | Boundary |
|---|---|---|
| B11/B13 | `linear-ipr` | Single supplied test, constant single-phase PI |
| B12 | `vogel` | Saturated solution-gas-drive only; supplied bubble point |
| B14 | `nodal` | Intersection of supplied monotone IPR/VLP, no extrapolation or generated VLP |
| C22/C23 | `giip`, `recovery-factor` | Explicit dry-gas volumetrics / same-reference historical ratio |
| C27/C28/C29 | `darcy`, `corey`, `capillary` | Explicit simple-model applicability; no multiphase solver/hysteresis |
| D40 | `decline-backtest` | Chronological exponential holdout, actual time, no future leakage |
| F51/F52/F55/F58 | `oil-bo`, `gas-bg`, `gas-z`, `gas-density` | Supplied parcel volumes/Z/P/T/molar mass, not EOS/PVT correlation prediction |
| G61/G62/G63/G64/G67 | `archie`, `density-porosity`, `gamma-ray`, `net-pay` | Explicit calibration/endpoints/cutoffs; missing logs unclassified |
| H71/H72/H74/H75 | `hydrostatic`, `ecd`, `pressure-window`, `mud-weight` | Static SI calculations with supplied friction/margins, never operational control |
| J92/J94 | `allocation`, `water-cost` | Same-basis proportional allocation / explicit scenario costs |

Method equations, primary reference URLs and limitations are attached to each executable definition in `science-methods.ts`. Reference URLs are methodological references, not claims of live browsing during a calculation or installed third-party simulators.

## D. Reproducible synthetic references

- IPR: Pr=20 MPa, test Pwf=15 MPa, test Q=100 stock m3/day → PI=0.00002 m3/day/Pa; at Pwf=10 MPa, Q=200 m3/day.
- Vogel: Pr=20 MPa, Pb=21 MPa, test Pwf=10 MPa, Q=70 → Qmax=100; at Pwf=5 MPa, Q=90 m3/day. Near-shut-in pressure differences are evaluated without catastrophic `1-Pwf/Pr` cancellation.
- Supplied nodal curves intersect at Q=100 stock m3/day, P=10 MPa. No intersection returns null plus an explicit limitation, not extrapolation.
- GIIP: A=1,000,000 m2, h=20 m, phi=.2, Sw=.25, Bg=.005 reservoir/standard → 600,000,000 standard m3; not recoverable reserves.
- Darcy: k=1e-12 m2, A=100 m2, dP=1e6 Pa, mu=.001 Pa.s, L=100 m → .001 reservoir m3/s = 86.4 reservoir m3/day.
- Archie: phi=.2, Rw=.1 Ohm.m, Rt=10 Ohm.m, a=1,m=n=2 → Sw=.5; inconsistent Sw>1 rejected.
- Hydrostatic: rho=1000 kg/m3, TVD=2000 m, surface=101325 Pa absolute → delta=19,613,300 Pa; bottom=19,714,625 Pa absolute.
- Water cost: 1000 m3 × 2.5 USD/m3 + 100 USD = 2600 USD. Money uses exact rational operations over the accepted JSON number's canonical decimal, then numeric serialization; arbitrary-precision original decimal strings are not supported. Nonzero cost inputs are bounded below by 1e-12.

## E. Verification

Commands from this application directory (Node 22, installed lockfile dependencies):

```text
npm run test:oil-science
npm run test:mpce
npm run test:petroleum-context
npm run test:oil-report
npm run test:petroleum
npm run test:petroleum-field
npm run test:petroleum-api
npm run test:petroleum-stream
npm run test:petroleum-documents
npm run typecheck
node node_modules/next/dist/bin/next build --webpack
```

`verify-petroleum-api.mjs` exercises all 23 new methods and six scientific file exports against the actual handler. `verify-petroleum-stream.mjs` checks all 23 methods through the actual SSE route; model/media/code provider boundaries throw if touched. Auth/quota/storage edges are explicit fixtures, not a live account/security test. Native text PDF tests require local Poppler (`pdfinfo`, `pdftotext`), not OCR or a cloud service.

Optional browser command: `npm run test:oil-science-browser` (Playwright/Chromium path variables as in the existing MPCE browser harness). Bundles the real Markdown and Recharts components; verifies scientific reports on 390/1280px in RU/EN/KK/AR. This is not a real-device Safari/Android or authenticated dashboard test. QA bundler/client files are never imported by the app.

Verified locally on 2026-10-14:

| Check | Result / scope |
|---|---|
| Science + MPCE + contextual petroleum + Oil report | 682 / 682 PASS (412 new scientific scenarios, 270 retained) |
| Core petroleum + field-surveillance + PDF/DOCX | 247 / 247 PASS, using the supported Node TS resolver and local Poppler |
| Accuracy engine | 125 / 125 deterministic fixtures PASS; 25 / 25 recognized contradiction repairs; 0 / 24 false warnings; not global LLM accuracy |
| Integrated MAX engine | 37 / 37 simulated-provider checks PASS with the existing test runner/auth fixture |
| Scientific real Markdown/Recharts | 32 / 32 Chromium component scenarios PASS (390/1280px × RU/EN/KK/AR × 4 representative reports) |
| Existing Oil report component | 8 / 8 PASS including stored inputs, numerical values, true time gaps, legends, well switching and actual JSON download |
| Actual skill HTTP / chat SSE | PASS for all 23 methods; six scientific exports; invalid physical input returns 422; one local answer/completion; provider calls forbidden by fixtures |
| TypeScript / changed-runtime ESLint | PASS, zero reported errors/warnings in the selected runtime files |
| Full Next.js webpack build | PASS, including the concurrent main MAX fix `f86f66d4`; TypeScript and 84 generated static pages completed; runtime source hashes matched the working branch |

Failed initial attempts were not product PASS results: direct Node strip-only invocation lacked the existing resolver/transform/auth fixture; a custom browser harness initially lacked CSS handling; Windows initially denied a QA output directory; a later build/screenshot ran out of temporary disk space. Re-runs used the supported runners, corrected QA bundling, authorized local output access, compact chart screenshots and the **existing** `MALIK_BUILD_NO_CACHE=1` option. Only ~1.9 GB of regenerable webpack cache in the separate QA copy was removed. Runtime code and production caching were not changed to conceal failures.

Warm local microbenchmark: 230 scientific calculations **including independent numerical checks** took about 16 ms in one run; zero provider requests/tokens/cost for that code path. This is not HTTP throughput, cold-start, real model response latency or production memory performance. No elapsed-time or cost claim applies to optional model interpretation outside that closed path.

## F–H. How to check in the existing chat

Select Malik Oil AI or use the existing mention, then paste:

```text
@Malik Oil AI Рассчитай method=hydrostatic densityKgM3=1000 tvdM=2000 surfaceAbsolutePa=101325 dataKind=synthetic
```

Expected: the hydrostatic reference above, a real receipt/check count, no model call. Explicit `key=value` shorthand also supports flat scientific methods; array/curve/interval inputs use JSON. Missing/duplicate/ambiguous numeric parameters fail validation, never silently guessed.

```text
@Malik Oil AI
```
```json
{"op":"scientific","input":{"method":"vogel","dataKind":"synthetic","reservoirPa":20000000,"bubblePointPa":21000000,"testFlowingPa":10000000,"testQM3Day":70,"flowingPa":5000000,"applicability":"saturated-solution-gas-drive"}}
```

Paste the mention and JSON together in one message (the existing `petroleum`/`json` fence is also supported). Expected Q=90, Qmax=100 stock m3/day plus a numeric-pressure curve. Synthetic graphs are labelled examples; user-derived model graphs are estimates, not measurements. Documents omit interactive fences but retain numerical tables and scope. Scientific JSON exports retain all numeric coordinates and execution metadata.

API: existing `POST /api/work/skills/run`, authorized normally, body `{"skill":"petroleum.analyze","task":{"op":"scientific","input":...},"language":"ru","format":"json"}`. Existing formats DOCX/PDF/XLSX/MD/JSON/HTML apply; existing Arabic-PDF refusal remains (not a validated Arabic PDF layout). No auth bypass added.

## I–J. Release and limitations

This is a tested extension, not completion of all 100 capabilities. Still absent: full VLP/lift/ESP/gas-lift design, calibrated material-balance/pressure-transient inversion, viscosity/bubble-point/solution-GOR correlations, coupled EOR simulation, calibrated uncertainty/Monte Carlo, and field-validation evidence. No OPM/PorePy/DeepXDE simulation, actual private well data, 1TB knowledge corpus or external LLM ensemble is claimed. Do not present this slice as an autonomous certified petroleum engineer or a safe drilling/production controller.

Full app end-to-end remains subject to configured WorkOS and authorized test access; local component/fixture success does not prove production login or deployment. A Git push does not itself confirm a Render deployment. No Render action is authorized by this extension.
