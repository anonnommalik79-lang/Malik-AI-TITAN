# Claim ledger methodology — v1

The ledger is a bounded record of explicit claims, **not** an answer-wide truth score. It makes no confidence-percentage claim and adds no model calls. It is computed from the final answer (not a stale streamed draft) before the SSE `done` event. The same builder is used by on-demand answer verification. Its serialized copy travels in `factAudit.ledger` and is restored with the existing message research data, including answers that did not use web search.

## Status rules

| Status | Evidence required | What it does not prove |
|---|---|---|
| VERIFIED / deterministic | Existing exact accuracy engine recognized a correct calculation on a calculation-only line | Correctness of user inputs, suitability of formulas for a real asset, or truth of neighbouring prose |
| VERIFIED / source-text-match | Entire normalized explicit statement occurs in the cited source's supplied excerpt; safe HTTPS URL and actual read timestamp exist | Source truth, authority, currency, applicability or independent corroboration |
| SUPPORTED / user-input | Existing accuracy classifier identifies user-data origin and matching user-supplied quantities | Real-world truth or calibration of the data |
| SUPPORTED / number-occurrence | A cited snippet contains the claim's recognized quantities | Semantic entailment; matching a number never upgrades a whole claim to VERIFIED |
| UNCERTAIN | Assumption, forecast, unresolved numerical issue, or observed disagreement in comparable expert metrics | A forecast is not a measured fact; expert votes are not verification |
| UNVERIFIED | No eligible evidence, broken/absent citation, unsupported or malformed evidence | Does not mean the statement is necessarily false |

The existing numeric audit remains for backward compatibility. The new disclosure separates its numerical-presence check from stronger calculation/text-match evidence. Users are not asked to search the web to justify deterministic arithmetic or their own supplied data. The on-demand route skips search for purely local claims.

## Expert review scope and privacy

The existing MAX panel is retained. There are no extra model participants or synthesizer calls. Only an integer disagreement count is added to its public operation receipt. Detection is deliberately narrow: the same labelled metric/unit (MAU/MRR/ARR/ARPU/ARPPU/NPV/IRR/revenue/conversion/price); assumptions, scenarios and forecasts are excluded. Free-form or unlabelled disagreements can be missed. Expert content, hidden reasoning, prompts, credentials and provider names are not copied into the ledger.

## Limits

- First 60,000 answer characters, 16 sources with excerpts bounded to 12,000 characters, 32 explicit claims plus at most one expert-disagreement notice.
- Software blocks and generated-project receipts are excluded; literals, settings, line numbers and internal timestamps must not look like unverified world facts.
- General prose without a recognized explicit claim can remain unaudited. No universal semantic fact checker is claimed.
- Restoration whitelists fields, sanitizes links and recomputes counts. Invalid evidence cannot retain an internally inconsistent VERIFIED status. Displayed history is not a signed attestation and grants no privileges.
- Current-source selection/freshness still belongs to the existing research router; lexical matching does not replace it.

Regression commands: `npm run test:claim-ledger`, `npm run test:ultimate-chat`, `npm run test:claim-ledger-browser`.
