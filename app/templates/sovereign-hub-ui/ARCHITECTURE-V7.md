# Malik AI V7 — unified intelligence, phase 1

This is an incremental runtime migration, not a claim of parity with another company's private architecture.

- One request-owned turn plan supplies admission, response, and rescue: normalized history, intent, domain, focus, current-fact policy, and a fixed turn clock.
- The model can refine a bounded read-only evidence decision; explicit user opt-outs and server policies take precedence. No new external write access.
- Existing model gateway, actual web tools, artifacts, auth, history, and media remain active. No provider credential or billing changes.
- Run npm run test:unified-intelligence, npm run typecheck, npm run build and release regression suites.
- Next phases: typed tool-call/receipt loop across tools, persistent run state, simplify prompt composition, unify artifact events and memory retrieval, then retire redundant branches after parity tests. No replacement of existing functionality before evaluation.
