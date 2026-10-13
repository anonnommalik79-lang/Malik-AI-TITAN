# MALIK Oil AI — Synthetic Investor Demonstration and Validation Gate
**Date:** 13 October 2026 · **Evidence:** synthetic fixtures; no customer field data.  
**Status:** validation candidate, not a certified simulator or production evidence.

## Executive decision
MALIK Oil AI currently has a deterministic petroleum computation layer for production rates, water cut, gas–oil ratio, Arps declines, material/phase mass conservation screening, simple periodic economic analysis, and reproducible receipts. Selected **Malik Oil 1TB** coordinates Ling 3.1 Flash, NVIDIA Nemotron 3 Ultra 550B and MalikLLM MAX. *Code integration does not prove production availability, three actual successful model calls or engineering accuracy of model prose.*

**Proposed offer to UAE operators/investors:** a bounded, engineer-supervised analytics pilot, not autonomous field control, guaranteed incremental barrels or a trained reservoir digital twin.

## Demonstration 1 — single-well surveillance (synthetic)
Same-period stock oil and water rates and standard gas rate; these are **instantaneous daily rates reported at monthly sample dates**, not monthly production volumes.

| Month (2026) | Oil, bbl/day | Water, bbl/day | Gas, scf/day | Water cut | GOR, scf/bbl |
|---|---:|---:|---:|---:|---:|
| January | 100 | 20 | 50,000 | 16.67% | 500.00 |
| February | 95 | 25 | 48,000 | 20.83% | 505.26 |
| March | 90 | 30 | 47,000 | 25.00% | 522.22 |
| April | 85 | 35 | 46,000 | 29.17% | 541.18 |
| May | 80 | 40 | 45,000 | 33.33% | 562.50 |
| June | 75 | 45 | 44,000 | 37.50% | 586.67 |
| July | 70 | 50 | 43,000 | 41.67% | 614.29 |
| August | 65 | 55 | 42,000 | 45.83% | 646.15 |

**Independently recomputable formulas:** WC = water/(oil+water); GOR = gas/oil; oil-rate drop = (65–100)/100 = **–35.00%**. Water cut rises **29.17 percentage points**. Total liquid remains 120 bbl/day in every sampled month, but this is *not proof of constant monthly sales or reserves*. Pressure, operating time, standard gas reference conditions and lab PVT are not supplied; do not infer depletion mechanism or well intervention recommendation.

The in-app oil report should display oil, water and gas *separately* with correct units, plus water-cut and GOR trends. Never draw gas scf/day on an unlabelled oil bbl/day axis or present interpolated rates as measurements.

## Demonstration 2 — illustrative simple economics, not a valuation
**Assumptions:** one calendar-year period, 1,000 sold units, price $70/unit, variable OPEX $20/unit, fixed OPEX $1,000, initial CAPEX $40,000, 10% annual end-of-period discount.

- Gross contribution: 1,000 × ($70 − $20) = **$50,000**.
- Year-1 cashflow: $50,000 − $1,000 = **$49,000**.
- NPV: −$40,000 + $49,000/1.1 = **$4,545.45**.
- Break-even unit price: $20 + ($40,000 × 1.1 + $1,000)/1,000 = **$65.00**.
- Price scenarios are deterministic what-if calculations; **not probability distributions or forecasts**. Taxes, royalties, abandonment, financing, FX, country fiscal terms, inflation and field decline are omitted.

## Acceptance: 30 explicit, independently derived tests
Implementation: `scripts/verify-oil-investor-30.mjs`, run by `.github/workflows/oil-investor-30.yml`. CI outcome is the authority; **do not mark passing until Node 22 CI is green**.

| IDs | Tests | Acceptance source | Evidence class |
|---|---|---|---|
| 01–04 | Normal and mixed-unit water cut; shut-in 0/0 | Analytical fraction, undefined on 0/0 | Deterministic |
| 05–08 | GOR and mandatory gas basis; dimensional rejection | Analytical scf/bbl, strict units | Deterministic |
| 09–10 | Barrel↔m³, scf↔sm³ | SI definitions, fixed gas reference | Deterministic |
| 11–16 | Exponential, hyperbolic and harmonic Arps; integrated rate; invalid b | Closed-form equations | Deterministic under model assumptions |
| 17–19 | Fit synthetic known decline; reject shut-in and non-decline | Generated rate law, acceptance gates | Screening only |
| 20–25 | Independent discounted NPV, IRR, cashflows, break-even and sensitivity | Hand-derived discounted flows | Scenario calculations, pre-tax |
| 26–28 | Two-phase matrix/fracture transfer, hidden local imbalance, negative mass | Independent kg-integrated conservation ledger | Aggregate audit only |
| 29 | Raw-state memory floor for 10M cells × 4 float32 values | 160,000,000 bytes | Lower bound, **not** GPU training usage |
| 30 | PVT/PINN/trained history-match/EOR/drilling not offered as active deterministic solvers | Explicit schema rejection | **Not demonstrated** |

Numerical tolerances: 1e-9 relative for most analytic golden results; 1e-7 for bracketed IRR. No random sampling, paid inference, private client data or provider credentials in CI.

### Advanced engineering qualification — separate proof required
| Capability | Current evidence | Required to claim success |
|---|---|---|
| Physics-informed neural network (PINN) | Equation and mass-ledger guidance only | Trained weights, documented architecture, training run, PDE+interface residuals, held-out measurements, convergence and high-resolution reference |
| Fractured dual-continuum model | Aggregate kg ledger | Local FV face-flux conservation, phase saturation constraints, breakthrough and fracture topology benchmark |
| History matching | Basic exponential decline screening | Blind pressure/rate/water-cut history match with uncertainty bands and holdout interval |
| Polymer/chemical EOR | Screening guidance | Lab salinity/viscosity/adsorption and coreflood studies; injectivity and economics vs waterflood |
| PVT | No calibrated EOS or lab PVT solver in deterministic engine | Fluid sample, phase envelope, bubblepoint, lab match and uncertainty |
| Drilling | No real-time well controller | Approved design data and independent well-control/HSE safety review; no automatic execution |
| Reservoir forecast speed | Not benchmarked on real GPUs | Exact test hardware, timed warm/cold runs, error-vs-high-fidelity simulator and cost |
| Three-model consortium | Static orchestration and mock 3/3 tests | Live production requests, per-provider outcome and latency, truthful 3/3 or 2/3 |

## How an investor pilot demonstrates value
Compare **manual engineering reporting**, **MALIK deterministic calculations + engineer review**, and **a conventional licensed reservoir simulator** (for physics tasks). Measure same dataset, same metrics, same errors and independent engineer sign-off. Complex surrogate alternatives include physics-constrained PINN/FNO/GNN vs conventional simulator and simple empirical baseline, but none is declared the winner without experiments.

A labor-savings ceiling with **illustrative inputs only**: 500 jobs/month × (45 − 15) minutes saved/job ÷ 60 × $50/hour = **$12,500/month before** incremental inference, review, infrastructure, security and integration costs. This is **not observed savings** and must not appear as actual traction or ROI.

For due diligence: obtain authorized sanitized 100-well data; identify reference pressure/volume bases; secure tenant isolation/retention; collect engineering sign-off; run 30 automated contracts plus independent client golden cases; and log exact model participation plus deployment SHA. Report failures, omissions and unknowns next to successes.

**Investment framing:** request funding for controlled co-development with milestones and governance. Model independence, full field predictiveness, true cost reduction and safety certification remain to be demonstrated.
