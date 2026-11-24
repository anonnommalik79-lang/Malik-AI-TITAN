# Malik AI V7 — unified intelligence, phase 1

This is an incremental runtime migration, not a claim of parity with another company's private architecture.

- One request-owned turn plan supplies admission, response, and rescue: normalized history, intent, domain, focus, current-fact policy, and a fixed turn clock.
- The model can refine a bounded read-only evidence decision; explicit user opt-outs and server policies take precedence. No new external write access.
- Existing model gateway, actual web tools, artifacts, auth, history, and media remain active. No provider credential or billing changes.
- Run npm run test:unified-intelligence, npm run typecheck, npm run build and release regression suites.
- Phase 2 initial read-only tool loop: after the first real web results, explicit deep research can ask the selected model for one structured decision, perform at most one extra lookup, deduplicate source receipts and pass them to the existing verifier. Budget: 256 planner tokens, 2.2s planning, 6s additional search. No extra call on ordinary chat, attachment turns, connected accounts, prepared evidence, or explicit no-web. MALIK_V7_RESEARCH_LOOP=0 disables it.
- Next phases: typed tool-call/receipt loop across tools, persistent run state, simplify prompt composition, unify artifact events and memory retrieval, then retire redundant branches after parity tests. No replacement of existing functionality before evaluation.
