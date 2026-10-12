# Malik Oil AI — proposed engineering analytics pilot

Purpose: process a legally supplied, bounded well-production dataset into audited metrics, conditional decline scenarios and an engineer-reviewable report. Decision support only; no operational equipment access.

Scope: one client, one agreed asset/data definition, approximately 100 wells for the initial comparison. This is proposed scope, not an established customer deployment. Country-specific properties come from asset records and verified public sources.

Client inputs: sanitized well IDs, ISO dates, oil/water/gas rate units and reference conditions, calibration/quality flags, intervention history, downtime/period hours and explicitly defined economics if required. Confidential production data are processed locally in the petroleum computation path. Public research and conversational interpretation use the existing provider infrastructure; corporate policy must be agreed before those paths receive confidential material.

Deliverables: input quality exceptions; water cut/GOR/availability and rate-change screening; applicable exponential decline scenarios with limitations; periodic economic results from supplied parameters; technical/management summary; replay fingerprint and algorithm version; exports in validated formats.

Acceptance plan:

| KPI | How to measure | Client baseline/target |
|---|---|---|
| Reporting time | Same table and output scope, timed manual workflow versus engine + engineer review | To supply |
| Numerical correctness | Independently approved golden calculations and explicit tolerances | To agree |
| Anomaly quality | Engineer-labeled events; precision and recall, including false alerts | To supply |
| Processing time | Client-sized tables, p50/p95 latency including import/export | To agree |
| Reproducibility | Same input, version and parameters → same numerical result | Required |
| Arabic usability | Native petroleum engineer evaluates terminology, tables and mixed-script reports | To agree |
| Data protection | Verify tenancy, session authorization, retention/deletion and provider policy | Required before client data |
| Cost/job | Measured compute/storage/model costs of the agreed workflow | To measure |

Potential savings are calculated only after supplying jobs/month, manual minutes/job, review minutes/job and fully burdened labor cost. Formula: `jobs × (manual minutes − assisted+review minutes)/60 × labor cost/hour − measured incremental processing cost`. No positive saving is assumed; negative results are allowed.

Prerequisites: named authorized engineer, dataset owner approval, client security requirements, validated operating regime for forecasts, independent Arabic review and an agreed limitation/incident escalation process. Arabic PDF and locally parsed PDF/DOCX input are outside the first release. Confirm the product's full regression/deployment gate before any client-facing rollout.
