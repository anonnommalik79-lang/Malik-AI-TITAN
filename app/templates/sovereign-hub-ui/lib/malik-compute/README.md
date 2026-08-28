# Malik Compute v1

`/compute` uses the existing dashboard shell and authentication. Its read-only
`/api/compute` endpoint returns **explicitly labelled demo data**, not real usage.
Only the existing verified WorkOS owner receives the Admin payload.
No provider credentials or new dependencies are needed for this preview.

## Ready service boundary

- `config.ts`: daily limit 1000 MCU; centralized operation weights and Agent limits.
- `service.ts`: one per-user/day balance, estimates, reservations, settlement,
  refunds, idempotent request IDs, aggregated usage.
- `adapter.ts`: isolated in-memory demo store and `executeWithCompute`.
  It reserves before executing, settles successful measured usage, refunds all
  reserved MCU on failure and returns sanitized errors.
- A provider fallback calls the supplied `reportFallback` callback. It remains
  inside the same reservation. This module does not implement provider routing.

The default period is UTC midnight to midnight. Reservations retain their original
day when settled. Actual cost must not exceed the reserved ceiling; an invalid
estimate is rejected and the execution adapter releases its reservation.
Operation weights are MCU per server-defined unit, not prices or provider tokens.
Agent uses a 5 MCU base multiplied by the estimated units; 150 MCU is its ceiling.
Steps/retries are constants ready for the future Agent caller, not an agent engine.

## Not connected yet

The current `app/api/stream/route.ts` and `malikGodAnswer` were inspected.
Responses omit authoritative usage and may come from cache or a multimodal path.
Changing that working flow is intentionally outside this focused v1.

TODO before enabling production quota enforcement:

1. Connect durable per-user storage with an atomic balance update. The in-memory
   adapter is **demo/development only**, resets on restart, and is not cross-process.
2. Derive identity from the existing server-side session, never client email/role.
3. Supply a server-owned request ID, operation, cost ceiling and measured cost to
   `executeWithCompute` for Chat, Agent, Research, Images, Voice, Video and Plugins.
4. Define reservation expiry/cancellation and cached-response billing policy.
   Replay completed results from the caller's cache; do not re-execute the same ID.
5. Replace demo page data with the live store and connect real admin telemetry.
   Provider Health and Routing Distribution remain explicitly disconnected.

Offline checks: `npm run test:compute`. No API calls, keys or credits are used.
