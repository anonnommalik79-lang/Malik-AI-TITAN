# Operation Malik Oil — field intelligence audit

Audit baseline: `ff984845` (current origin/main, 2026-10-12). Existing oil skill, deterministic engine and document intake branches are already included in main. The implementation branch is `codex/malik-oil-field-intelligence-20261012`; no main merge or Render deployment is authorized for this task.

## Existing architecture to extend

- `lib/work/petroleum/{schema,engine,production,units,reservoir,economics}`: bounded typed operations, strict CSV units, well histories, water cut/GOR, Arps/exponential fit and periodic NPV/IRR.
- `message.ts`, `documents.ts`, `router.ts` and `/api/stream`: local computations precede provider/media execution; one SSE answer. Existing skill API `/api/work/skills/run` supplies auth, body/rate bounds, export and owner-scoped audit receipts.
- `report.ts` uses the existing Markdown/visual contract. Claude's components and general design must not be replaced.
- Existing private JSON store supports conditional immutable writes and private object access; account identity comes from the existing entitlement resolver. No organization RBAC is present in the oil layer.

## Gaps / root causes

1. Well names alone do not establish a field/reservoir/pad hierarchy or ownership of a dataset.
2. History consists of rate snapshots. Without a declared averaging interval, multiplying these by months or summing them would invent volumes and losses.
3. A 30% adjacent-change flag is not configurable surveillance, a causal diagnosis or a validated counterfactual baseline.
4. Registered downtime, plan gaps, baseline gaps and recoverable scenarios are not separated. Adding overlapping gaps would double count losses.
5. No field-level evidence graph, task progress/cancellation or immutable owner-authorized dataset/report snapshots are exposed.
6. Existing production import requires an oil column. Gas-only analysis must not pretend an absent oil measurement was measured zero.

## Delivery gates

P0: explicit asset IDs/relationships, configurable screening, interval-aware non-overlapping gap decomposition, no diagnosis/guaranteed recovery, structured evidence/UI contract, actual routing/HTTP tests and >=50 new scenarios.

P1 foundation: reuse existing conditional decline and economics; compare supplied recovery assumptions with explicit price/cost/currency/time basis. Do not imply full petroleum fiscal modeling.

P2: advanced material balance, PVT, waterflood/3-D simulation and nonlinear optimization remain gated on necessary inputs, licensed/validated methods and independent engineering benchmarks. No pseudo-simulator.

P3 foundation: owner-isolated immutable snapshots through existing private storage, explicit authorization/storage consent, expiry/deletion; no new cloud service. Organizational RBAC, calibrated field validation and distributed crash-safe workers remain separate work.

Source review: NIST's outlier handbook was retrieved on 2026-10-12 (modified Z/MAD is an outlier-screening method, not a petroleum failure classifier). Energistics' public standards/catalogue pages were retrieved; internal JSON is not PRODML/WITSML/RESQML conformance. SPE PRMS retrieval returned 502; the existing background link is not newly verified evidence.
