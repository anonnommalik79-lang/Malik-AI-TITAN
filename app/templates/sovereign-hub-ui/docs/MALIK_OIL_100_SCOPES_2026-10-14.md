# Malik Oil: 100 bounded numerical capability scopes

Release branch: `codex/malik-oil-complete-scopes-20261014`, based on `b22e1f96`.
Algorithm `malik-petroleum-1.4.0`; catalogue `mpce-catalog-1.2.0`;
advanced results `oil-science-1.1.0`. Older scientific receipt version 1.0 remains readable.

**100/100 refers to executable, tested numerical scopes in this catalogue. It does NOT mean 100% product completion, field accuracy, certified engineering, a full reservoir simulator, a verified enterprise deployment or tested 1 TB processing.**

## A. Root causes and repairs

- The last release exposed 51 catalogue scopes. The other 49 had no executable kernels; a model narrative or a literature link could not implement them.
- Added 38 closed method contracts covering those 49 IDs. Each has explicit required data, units, applicability, bounded computation, a result contract, formula/reference, independent numerical checks and synthetic reference tests.
- Deliberately separated candidate screening from simulation: supplied ESP curves are not a vendor database; discrete gas-lift tests are not valve design; supplied MMP screening is not an EOS or recovery prediction; pressure-hold screening is not well-integrity certification.
- Independent regression uses pairwise slopes, economics uses backward discounting, and probabilistic audit regenerates the seeded inverse-CDF calculations without importing or replaying the production calculator. Simple identities necessarily use the same physical equations; this is not an independent physics model or field validation.
- Fixed dimension-sensitive verification tolerances, including tiny permeability and viscosity. Pressure residual rounding must not become a viscosity tolerance.
- Added exact-boundary regressions for water-cut crossing and Archie cutoff decisions. A logarithmic audit may differ from the canonical power calculation by one ULP; it must not change a discrete cutoff classification.
- Near-zero simulated NPV is reported as numerically ambiguous, not a confident loss probability caused by floating-point cancellation.
- Standing Rs requires an explicit 60F/14.7psia gas/stock-oil reference declaration. A different standard state is refused, not silently treated as equivalent standard cubic metres.
- Raw PVT/log points retain user provenance and unlogged gaps. Axis names and physical units are visible in the existing chart note; long Bg units are meaningfully abbreviated, not silently truncated.
- Escaped untrusted parameter text in BOTH the input audit and scientific result. A reference/period cannot become a remotely loaded Markdown image.

## B. Implemented methods

| IDs | New executable method | Actual scope |
|---|---|---|
| B15, H78 | pipe-profile | Single-phase incompressible tubing/VLP; supplied Darcy factor |
| B16 | choke | Incompressible orifice; supplied Cd |
| B17 | lift-screen | Supplied rate/head/temperature envelope margins |
| B18 | esp | Supplied per-stage curve, interpolation and affinity scaling |
| B19 | gas-lift | Best supplied feasible test, explicit gas budget/gain |
| B20, I87, J91 | scenario-compare | Purpose-gated intervention/EOR/development cash-flow comparison |
| C24 | gas-material-balance | Closed dry-gas p/Z tank regression; no aquifer/injection |
| C26 | drive-screen | Closure/fractions of supplied expansion/influx terms |
| C30 | reservoir-sensitivity | One-at-a-time homogeneous volumetric sensitivity |
| D38 | forecast-uncertainty | Seeded IID log-residual exponential predictive bootstrap |
| E41, E44, E45 | drawdown-test | User-selected late-time single-phase semilog permeability/skin |
| E42, E43 | buildup-horner | Constant-prior-rate Horner permeability/Pstar |
| E46, E47, E48 | pressure-derivative | Bourdet derivative and nonunique regime/boundary compatibility |
| E49 | interference-screen | Matched regular-sample lag correlations, not causation |
| E50 | well-test-qc | Ordering, rate CV, gauge signal size, logarithmic time span |
| F53 | oil-viscosity | Same-pressure two-lab-point Andrade interpolation |
| F54 | gas-viscosity | Range-checked sweet-gas Lee–Gonzalez–Eakin 1966 |
| F56, F57 | standing-pvt | Range-checked Standing 1947 bubble point/saturated Rs |
| F59 | pvt-plot | Supplied property against absolute pressure |
| F60 | pvt-compare | RMSE/bias/MAPE of supplied aligned correlation values |
| G65 | density-neutron | Density porosity/crossover with supplied correction/threshold |
| G66 | resistivity-log | Forward clean-matrix Archie and measured residual |
| G68 | formation-evaluation | Explicit shale/density/Archie cutoff classification; invalid stays unknown |
| G69 | log-plot | Exact supplied depth/property points; no gap interpolation |
| G70 | petrophysical-uncertainty | Seeded triangular phi/Rt propagation; invalid draws counted |
| H73 | drilling-hydraulics | Pipe/annulus loss with supplied Darcy factors |
| H76 | wellbore-stability | Vertical isotropic elastic Kirsch/MC, explicit 5-degree grid |
| H77 | completion | Supplied perforation-orifice pressure/velocity screen |
| H79 | formation-damage | Pseudosteady TOTAL radial skin, not damage-cause diagnosis |
| H80 | integrity-assessment | Isolated temperature-stable pressure-hold screening |
| I81 | waterflood | Supplied mobility/voidage replacement/injected pore volumes |
| I82 | injectivity | Injectivity and interval-aware Hall/injected-volume integration |
| I83 | polymer-screen | Supplied compatible lab viscosity/retention/mass balance |
| I84, I85 | co2-screen | Supplied MMP/pressure/purity windows; not containment approval |
| I86 | thermal-screen | Lumped sensible heat/steam-mass balance |
| I88 | injection-allocation | Capped proportional allocation; not oil optimization |
| I89 | breakthrough-screen | Sustained observed threshold bracket; no unique physical diagnosis |
| I90, J99 | monte-carlo | Purpose-gated seeded independent triangular financial/EOR scenarios |

Exact contracts: `lib/work/petroleum/science-advanced-schema.ts`.
Exact methods, references and limitations: `science-advanced-methods.ts`.
The 49 new IDs plus 51 previous scopes cover A01–J100. Shared kernels serve multiple IDs only where the underlying computation genuinely overlaps; scenario purposes are checked, not substituted.

## C. Catalogue status

| Status | Count | Meaning |
|---|---:|---|
| IMPLEMENTED & VERIFIED | 100 | In the documented synthetic/numerical scope only |
| IMPLEMENTED VALIDATION PENDING | 0 | No enabled unchecked numerical kernel |
| PROTOTYPE | 0 | No placeholder operation advertised as implemented |
| NOT IMPLEMENTED | 0 | Within THIS bounded catalogue, not all petroleum engineering |
| NOT APPLICABLE | 0 | Applicability is enforced per task instead |

**Field applicability, measurement provenance, empirical coverage and professional certification remain NOT VERIFIED.** For example F53 needs supplied lab data; C24 is not black-oil MBAL; E47 does not locate a reservoir boundary; H80 is not a full integrity management system. Catalogue completion must not conceal these distinctions.

## D. Retained TITAN FIELD golden reference

Synthetic 16-row fixture, not observations:

| Quantity | Golden |
|---|---:|
| Field exponential fitted qi | 910.922155151584 bbl/day |
| Nominal D | 0.03463014992678802 /month |
| R² in log-rate space | 0.9893300292495641 |
| January field-model rate | 601.1807539242155 bbl/day |
| April field-model rate | 541.858661243234 bbl/day |
| January sum of well models | 603.563540 bbl/day |
| April sum of well models | 546.835619 bbl/day |

Field fit and sum of well fits are explicitly different methods. The regression tests retain time targets, pressure datum, cumulative-volume rules, missing-data states, chart/metric agreement and routing regressions.

## E. Verification and reproducibility

Run on Node 22, using the existing QA dependency environment; no production keys or model responses are required for numerical verification.

```text
node --test scripts/verify-oil-science.mjs scripts/verify-oil-advanced.mjs scripts/verify-mpce.mjs scripts/verify-petroleum-context.mjs scripts/verify-oil-report.mjs
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs --test scripts/verify-petroleum.mjs scripts/verify-petroleum-field.mjs scripts/verify-petroleum-documents.mjs
node scripts/verify-petroleum-api.mjs
node scripts/verify-petroleum-stream.mjs
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/verify-accuracy-engine.mjs
node scripts/run-malik-max.mjs
node scripts/verify-oil-science-browser.mjs
node scripts/verify-mpce-browser.mjs
npm run typecheck
next build --webpack
```

`npm run test:oil-science` now includes both scientific suites in CI. CI path filters include the new fixtures/tests. Poppler `pdfinfo` AND `pdftotext` are required for local native-text PDF tests. Playwright/Chromium are required for browser checks.

Final outcomes are appended below after the final-code gate; an earlier successful build must not stand in for later source edits.

Actual measured local kernel sample: 305 runs across 61 methods; p50 0.0966 ms, p95 0.8394 ms, max 5.2340 ms. Monte Carlo 10000×60 periods with separate audit: 94.8313 ms; process RSS after these runs 108.54 MiB. These are synthetic local timings during concurrent QA, NOT end-to-end latency, peak memory guarantees, model accuracy or cloud cost measurements.

An initial heavily concurrent retained-suite run had one failure; a subsequent full dot-reporter rerun passed. The first filtered output did not retain the failing test name. A later retained run failed at `pdfTextAvailable()`: native capability probes have a 1500 ms subprocess budget. Idle probes then succeeded (pdfinfo 351.54 ms; pdftotext 34.69 ms), and the final serial retained run passed 247/247. This is an observed load-sensitive Windows QA limitation, not proof of the initial failure's cause. No assertion, timeout or production guard was weakened to conceal it.

## F. Actual model execution

All 61 scientific methods run closed local TypeScript numerical code with **zero AI-model calls**. The stream tests make provider/media/code-generator boundaries throw if called. Existing optional model interpretation and public research remain separate; they were not live-tested or claimed as executed. No simulator package, field calibration, external vendor database or model consensus was fabricated.

## G. User experience

Existing chat, navigation, composer, responsive layout, icons, CSS, application assets and authentication are retained. New results appear inside existing Markdown/visual report blocks. Curves carry scenario/user provenance, coordinate units, numerical tables and limitations. No new dashboard or frontend component was introduced.

Actual route tests exercise the existing skill HTTP handler and `/api/stream` implementation, all 61 method tasks, one final answer, admission/quota boundaries and CSV/DOCX/PDF behavior. Auth/quota/provider boundaries are explicitly fixtures, NOT a logged-in production session. HTTP binary export checks cover DOCX/PDF/XLSX/MD/JSON/HTML on five representative old/new results. Arabic PDF remains an explicit 422 refusal; Arabic HTML/DOCX is available. Native-text PDF extraction is tested, OCR is not implemented.

## H. Demonstration and pilot readiness

Ready for a **synthetic technical demonstration**, with method/units/evidence/limitations shown. Retained production, volumetric and economics demos plus new manufactured well tests, ESP and Monte Carlo can be replayed from the committed fixtures. See `MALIK_OIL_QUICK_CHECK_2026-10-14.md` for copyable chat inputs.

Not an approved real-asset decision system. An authorized petroleum engineer must approve asset applicability, input quality, operating envelopes and acceptable uncertainty. Existing pilot proposal is not a signed client engagement, industry endorsement or certification. Do not claim validated 1 TB operation or incremental oil recovery from these numerical tests.

## I. Git and deployment

Changes are developed on the feature branch above. The owner authorized normal main publication after checks. Final commit SHA, remote-main confirmation and CI results are reported in the chat after Git succeeds. Commit marker `[skip render]`; no Render service/deploy command is run. A Git push is not proof of a changed production deployment.

## J. Remaining limitations

- No configured local WorkOS client/API identity, no supplied authenticated test session. Full app E2E stops at the real auth boundary; middleware is not bypassed. This does not establish a production registration defect.
- Browser checks use actual components at 390/1280px with RU/KK/EN/AR/RTL. They are not physical iPhone/Android Safari tests or an authenticated enterprise workflow.
- No empirical field calibration, independent licensed simulator comparison, uncertainty coverage validation or professional signoff.
- No 3D/multiphase/thermal/compositional reservoir simulator, automatic lithology inversion, complete artificial-lift design, pressure-transient history matching or equipment control.
- Private S3/R2 is still not configured. No claim of persistent multi-tenant enterprise storage, 1 TB ingestion, background recovery or validated retention policy is made.
- Arabic PDF layout/OCR remain outside the verified export/import scope. Advanced methods primarily accept explicitly typed SI JSON; nested arrays are not guessed from unlabelled prose.
- Screens and downloads expose actual results, not invented data, but real-account entitlement, persistence, production-provider performance and current production deployment still need a configured end-to-end environment.

### Final-code gate

| Final gate | Confirmed result |
|---|---|
| Scientific + MPCE + context + report suites | 1601/1601 PASS; 0 failed/skipped/cancelled |
| Retained petroleum/field/native-document suites, serial | 247/247 PASS; 0 failed/skipped/cancelled |
| Accuracy Engine known fixtures | 125/125 PASS; 25/25 recognized contradictions, 0/24 false warnings in that fixture set |
| MAX failover fixtures | 37/37 PASS; no live provider calls |
| Consolidated cases above | 2010/2010 PASS in the final runs, not a global AI-accuracy percentage |
| Browser scientific reports | 96/96 PASS, 390/1280px × RU/EN/KK/AR, visible axis-unit captions |
| Retained actual React Oil report | 8/8 PASS, including real JSON download/legend/well selection |
| Existing skill HTTP + stream handlers | PASS for all 61 methods, 30 representative scientific export jobs, one response, provider boundaries forbidden |
| Additional existing gates | Model catalogue, Oil skill, ensemble fixtures, Work mode, Work math, Work documents, chat-stream contract, music intent PASS |
| Scoped runtime lint | 0 errors, 0 warnings on the 13 changed/new petroleum runtime files |
| TypeScript + final production build | PASS; Next Webpack build, 84 generated pages, local QA copy with 2 GiB heap/no persistent Webpack cache |
| Source-level UI freeze | PASS against b22e1f96: no TSX/CSS/assets/hosting-config changes |
| Real local app auth | BLOCKED before Oil; /api/health and /dashboard both HTTP 500 in unconfigured WorkOS middleware |

For the real local smoke test a temporary random cookie secret was generated only in the server process, not persisted or printed. That passed the cookie configuration requirement; WorkOS then explicitly reported missing API key/clientId. Both temporary test servers were stopped. No real user session, auth bypass, Render action or production repair is claimed.

The ordinary Markdown input audit remains bounded to 250 flattened values for display; full typed task/result data are retained in the JSON receipt. Large scientific inputs must be replayed using the original task/JSON rather than reconstructing it from the shortened display audit.
