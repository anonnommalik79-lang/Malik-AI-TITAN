# ULTIMATE 10 — security boundaries

- Retain account-derived ownership checks on every project artifact read/download. Never accept owner identity from the request body. ZIP tests include another-account denial.
- Project model output is source, not evidence. A model-authored `PROOF_PASSPORT.json` is replaced by a server-generated passport when downloading a project. SHA-256 describes the exported files, not proof of their safety.
- Restored passports validate schema and recompute status/commands/timestamps. Structural validity does not authenticate a client-provided receipt; it must not grant server-side privileges.
- Review failure and review unavailability are distinct. A caught provider error is `not_run`, never a fabricated `PASS`. Static syntax/import checks are not builds, browser tests or runtime verification.
- Do not execute arbitrary generated Node/npm projects in the web process. A child process plus Node permission flags is defense in depth, not an adversarial sandbox. Use a real isolated executor with denied egress, empty secrets, resource/output/time caps, and cleanup. No paid executor is provisioned by this change.
- Existing Game Studio runner is reused, not expanded into an unrestricted general-purpose runner. No claim is made here that its VM context alone constitutes a security boundary.
- No keys, real user messages or private env files are copied into QA or committed. Artifact TTL/retention remain unchanged; this task is not a storage migration.
- External publishing, payments, deletion and messaging retain existing confirmations. A successful local test never authorizes these actions.

## Self-Build worker contract

`lib/selfbuild/executor.ts` reuses the existing administrator-configured HTTPS executor URL/token, but requires an explicit `malik-node-test/1` receipt. It sends a fixed Node command (no shell, no npm install/lifecycle scripts), empty requested secrets and a deny-all network policy. Receipt protocol, source SHA-256, terminal state, command, isolation, exit code, test/failure counts, duration and bounded output are checked. Empty test suites, pending jobs, stale code hashes and unisolated receipts never pass. Cancellation is propagated and requests have a wall-clock deadline.

This is a **transport contract**: a remote service's claimed isolation still needs operational verification. It does not deploy or silently pay for a worker. Without that service the passport says `not_run` and the downloadable source remains PARTIAL. The actual local `node --test` regression uses only hardcoded, reviewed fixture programs; its helper checks their hashes before executing and is never part of the web app. It is not offered as a sandbox for hostile generated code.
