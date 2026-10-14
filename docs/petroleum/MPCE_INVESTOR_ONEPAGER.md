# Malik Oil — reproducible engineering assistance in chat

Release scope: MPCE 1.0.0, 2026-10-14. An engineering decision-support prototype, not a certified simulator, autonomous field operator, reserves evaluator or 1 TB hosting guarantee. No partnership or acceptance by an oil company is implied.

## What the demonstration proves

An explicitly unit-bearing production history is parsed locally, validated, calculated by versioned code, checked independently, and rendered into the existing multilingual black-and-white chat report. Original inputs, metric definitions, fitted parameters, chart values, screening weights and execution provenance remain available in a downloadable JSON file. Local calculations use zero AI provider calls; requested model interpretation remains a separately identified, unverified appendix.

The owner-supplied synthetic TITAN FIELD has four wells, four quarterly observations and 16 records. Field oil falls from 900 to 659 bbl/day, water rises from 315 to 614 bbl/day, WC rises from 25.925926% to 48.232522%, GOR rises from 612.222222 to 987.101669 scf/bbl, and arithmetic mean pressure falls from 2877.5 to 2560 psia.

The specified exponential log-OLS field model has D=0.034630149927/month, fitted qi=910.922155 bbl/day and R²(log)=0.989330. Conditional extrapolation gives 601.180754 bbl/day in January 2027 and 541.858661 in April. Summing separate well fits gives different numbers: 603.563540 / 546.835619. Both methods are shown explicitly. Neither is a reserves forecast or confidence interval.

## Three reproducible demonstrations

1. Production: paste the exact question and fixture from `scripts/fixtures/oil-titan-field.mjs`; compare report, CSV and JSON. Demonstrate pressure datum, DCA metrics, forecast dates, hypotheses and independent checking.
2. Reservoir: homogeneous synthetic volumetric geometry, area=1,000,000 m², net pay=20 m, porosity=0.20, Sw=0.30, Bo=1.20 reservoir m³/stock-tank m³. N=A·h·φ·(1−Sw)/Bo=2,333,333.333 stock-tank m³. Transparent scenario, NOT a calibrated PDE simulator or economically recoverable reserves.
3. Economics: explicitly declared USD and yearly periods, volumes=[100,95], price=70 USD/unit, variable OPEX=20 USD/unit, fixed OPEX=100 USD/year, CAPEX=1000 USD at t0, discount=10%/year. Cash flows=[−1000,4900,4650]; NPV=7,297.520661 USD. These are scenario inputs, not TITAN observations or market prices.

Reproduce with `npm run test:mpce`; the catalogue dispatcher supports the typed production, volumetric and supplied economic inputs. Existing work skill endpoints/export workflow remain available. No arbitrary AI-generated code executes on Render.

## Honest capability boundary

26 of the 100 requested capabilities have a callable, validated numerical scope in this MPCE release; 74 are NOT IMPLEMENTED here. This is not a claim of 100 complete petroleum modules. The list includes input/output contracts, equations, units, assumptions, references, error states, tests and UI integration scope. Full nodal/VLP, pressure-transient analysis, PVT correlations, petrophysical logs, geomechanics and EOR optimization require dedicated implementations and independent engineering validation.

The uncalibrated screening index is neither a failure probability nor an economic intervention rank. The observed gas increase on W-03 does not prove gas coning. Prices/costs are necessary for economics. Any physical intervention requires authorized engineer review and normal HSE controls.

## References and validation scope

- [aRpsDCA author-maintained reference](https://stat.ethz.ch/CRAN/web/packages/aRpsDCA/refman/aRpsDCA.html): Arps families, parameter and time-unit definitions. Consulted 2026-10-14; not an endorsement or claim that the R package was installed/executed.
- [NIST SI conversion guide](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors): conversion constants. Pressure scale and absolute/gauge datum are kept separate; ambient offsets are never guessed.
- [USGS volumetric methodology](https://pubs.usgs.gov/of/1986/0097/report.pdf): oil-in-place volumetric parameters. The simple synthetic SI implementation does not validate heterogeneous geology or reserves classification.

Field trials, calibrated instruments, blind production forecasts, real uncertainty coverage, hardware/Render capacity, production authentication/model-provider health and persistent private storage must be validated separately. Synthetic passing tests do not establish accuracy on every user question.
