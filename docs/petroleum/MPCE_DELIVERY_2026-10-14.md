# MPCE P0 — partial release requested by owner

Owner requested immediate commit/push of completed work, deferring remaining capabilities. This is NOT a declaration of full mission completion or 100% petroleum accuracy.

## Delivered

- Contextual pressure units including em-dash declarations, preserved psia/psig datum, no implicit ambient offset, normalized psi scale, explicitly calculated field mean.
- Explicit history years and January/April calendar targets; ambiguous/missing year stays unknown; horizon/schema and total-point limits.
- Linear, exponential, harmonic and bounded hyperbolic history fits. Separate rate/log R², nominal/effective labels, fitted qi, independent coefficient/forecast/table/chart checks.
- Single normalized, versioned, uncalibrated screening index with weights/scales/components and missing-data state; not a diagnosis or economic intervention rank.
- Measured/reported vs calculated/modelled/hypothetical/unknown evidence ledger; economic claims require explicit input contracts. Sparse snapshots do not become cumulative volumes.
- Real closed MPCE execution receipt, zero model calls for routine deterministic tables, optional actual model interpretation retained for broad/explicit requests, JSON download in existing Oil report.
- Genuine 100-entry inventory: 26 callable numerically validated capabilities; 74 NOT IMPLEMENTED in MPCE. Advanced methods remain deferred.
- Existing chat shell retained. Responsive monochrome charts/tables, real model anchors, gaps not joined, RU/EN/KK/AR and RTL. One bounded localized scientific-warning group instead of repeated fallback paragraphs.
- Synthetic volumetric scenario through the existing typed petroleum engine; investor one-pager with three explicit, reproducible scenarios and no certification/partnership/capacity claims.

## Confirmed verification

- New MPCE numerical/schema/unit/security/provenance tests and retained Oil/context tests: run with `npm run test:mpce`, `npm run test:oil-report`, `npm run test:petroleum-context`. TAP totals are reported by the scripts; tests run real TypeScript modules, not live model outputs.
- Independent TITAN field exponential: qi=910.922155151584, D=0.03463014992678802/month, R²(log)=0.9893300292495641; January=601.1807539242155, April=541.858661243234 bbl/day. Sum-of-well forecasts explicitly different.
- Actual React browser checks PASS for 390/1280px × RU/EN/KK/AR: values, pressure datum, well tabs, legend toggling, gaps, JSON download, no horizontal overflow. Local component harness only; NOT production-authenticated E2E.
- Accuracy regressions: 125/125 PASS, including 25/25 recognized contradictions and 0/24 false warnings in this fixture set. No universal answer-accuracy claim.
- Production Webpack build and full TypeScript passed during implementation. A standalone TypeScript run initially hit local native memory exhaustion, then passed with a 2 GB heap. Final code is additionally subject to GitHub CI; do not treat earlier build as validation of later edits.

## Explicit remaining blockers

- Full app/browser/API E2E stops before Oil: local WorkOS middleware returns HTTP 500 because API key/client ID are absent. Production registration was NOT tested or declared broken; auth was not bypassed.
- Local PDF native test could not run: bundled pdfinfo exists but pdftotext is absent. Temporary official Windows dependency extraction failed due disk-full; incomplete QA download was removed. Existing Linux CI installs poppler-utils for these tests. No PDF success was invented or cloud fallback used.
- No production model-provider calls, corporate field pilot, calibrated physics/simulator, uncertainty coverage, live storage or Render deployment was validated. Existing storage still requires private configuration.
- 74 catalogue capabilities, full reservoir physics, advanced well testing/PVT/logs/EOR/Monte Carlo and wider international demo/report polish are deferred.

## Source references

Method definitions and limitations: [author's aRpsDCA reference](https://stat.ethz.ch/CRAN/web/packages/aRpsDCA/refman/aRpsDCA.html), [NIST SI conversions](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors), [USGS volumetric methodology](https://pubs.usgs.gov/of/1986/0097/report.pdf). Consulted 2026-10-14. These are references, not installed simulators or endorsements.

## Git/deployment

Feature branch `codex/malik-oil-mpce-p0-20261014`, based on `a4e4cf7c`. The user authorized main publication of the partial release. Commit/merge outcome and CI status are reported separately with actual hashes. `[skip render]` is used; no Render service is manually launched.
