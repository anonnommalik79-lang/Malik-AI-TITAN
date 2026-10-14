# Malik Oil MPCE: audit against main a4e4cf7c

Scope: existing chat and Oil Core, no application redesign, no Render deployment, no arbitrary AI code execution. TITAN FIELD is synthetic; model accuracy and field diagnosis are not established by an arithmetic benchmark.

## Confirmed architectural defects before changes

1. `table-input.ts:pressureUnit` accepts `=`, `:`, `,`, `in`, not an em-dash declaration. `Pressure — psia` is omitted; the optional column is silently downgraded with a missing-units warning. `readPressureUnit` recognizes psia/psig but drops the basis in the contract. Charts/tables always label psi, and no field pressure mean is computed.
2. `readForecast` defaults to three months and does not parse named target dates. January/April 2027 after October 2026 therefore does not yield both requested forecasts. Yearless month names ignore explicitly declared history year. Calendar time must come from supplied metadata, never today's date or guessed forecast year.
3. `fitDeclineModels` has linear/exponential/harmonic only. Exponential OLS uses correct elapsed months, but `r2` is rate-space, not log-space. The benchmark's log-space R² cannot be identified. Nominal/effective decline labels and a bounded fitted hyperbolic implementation are absent.
4. `verifyOilAnalysis` verifies rate identities and finite chart values, but not fitted coefficients, forecasts, pressure, tables, metrics or chart agreement. A tampered forecast can pass this verifier.
5. Forecast charts prepend the final measurement to every model; this draws a false join when fitted q differs from measured q. Sparse history with omitted monthly samples is joined without an explicit discontinuity.
6. The scientific accuracy guard replaces each unsupported scientific numeric line with the same generic Russian paragraph. It exempts recognized exact arithmetic, but cannot express multiple rejected claims as a single localized diagnostic and destroys scientific table structure. Typed Oil reports already bypass this model-text guard; unstructured expert interpretation can still be affected. Merely deduplicating model output is not a fix for lost units/forecast targets.
7. `oilConclusion` says gas falls more slowly than oil whenever GOR rises. This is false for W-03, where measured gas rises. There is no single production screening index/receipt identifying thresholds, weights and evidence status. Existing field-surveillance screening is a separate, legitimate workflow, not a failure probability.

## Retained working components

Strict Zod schemas and dimensional conversions; CSV/XLSX/document import; rate/WC/WOR/GOR; field aggregation on common periods; local DCA/economics functions; server and client recalculation; multilingual monochrome Oil report; streaming activity; safety guards; existing exports and owner-scoped optional storage. No invented LLM calls or reservoir simulator validation.

## Release plan

P0: preserve pressure datum, contextual declarations and requested times; shared deterministic report data; independently verify arithmetic/DCA/visuals; fix misleading language and scientific fallback; real execution receipt, screening index and regression gates.

P1: four empirical decline families, strict callable capability inventory (100 items with honest implementation/validation statuses), reproducible production/reservoir/economics examples and bounded local execution. Advanced well-test/PVT/geomechanics/EOR/simulator calibration remain pending unless independently verified. No promise of 100% answer accuracy or 1 TB capacity.
