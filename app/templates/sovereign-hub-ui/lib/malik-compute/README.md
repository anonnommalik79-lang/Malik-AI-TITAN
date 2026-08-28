# Malik Compute v1 — live metering

The existing /compute page now reads actual per-user usage, not seeded demo data.
The verified WorkOS owner's Admin tab aggregates recorded operations.
Provider credentials, emails and other users' records are never returned to normal users.

## Connected

- Chat: /api/stream (SSE + plain text), /api/ai/chat, /api/ai/code.
- Research: chat's existing search policy + /api/malik-research.
- Plugins executed through /api/ai/chat.
- Images/video: /api/generate, /api/generate/[kind], /api/generate/video,
  /api/ai/image, /api/media/image, /api/media/video.
- Pending video: /api/ai/video[/status], /api/generate/video/status,
  /api/media/video/status.
- Voice: /api/transcribe, /api/voice/turn and /api/voice/tts.
- Translator: /api/translator.

Small wrappers preserve provider routing, model access and response contracts.
One balance covers these operations. Existing plan permissions, anti-abuse limits
and provider quotas remain independent of MCU.
No new agent engine is installed: its safety constants and service are ready.
Other legacy/business endpoints are not advertised as metered.

## Charging policy

1000 MCU per user per UTC day. Fixed completed-operation weights:
chat 1, research 5, image 10, voice 2, video 25, plugin 2.
Agent's future estimate is 5 per step, at most 150 per execution.
These are Malik allowance units, **not measured provider tokens, dollars or credits**.
Speech recognition, the voice answer and speech synthesis are three operations.

Reserve before execution; settle successful output; refund errors and unused units.
SSE must contain a nonempty answer and successful terminal event. Cancellation
before completion, failed/empty output and provider errors release the reservation.
Cancellation after a delivered terminal answer cannot undo its charge.
Local/cache/demo responses cost zero. Successful provider fallback costs one
operation, not one charge per attempted provider.
Search without usable sources costs zero; if the model still provides a successful
answer, only the chat weight is charged and the unused research reserve is refunded.

A queued video remains reserved until its own authenticated status poll confirms
success/failure. Repeated polling cannot charge twice. Jobs started before this
integration are not charged retroactively.
Abandoned reservations expire after 30 minutes and cannot be charged later.
Quota resets at 00:00 UTC; late completion uses the reservation's original day.

## Storage / Render — required deployment setup

FileComputeStore uses private JSON ledgers, exclusive per-ledger locks and atomic
write/rename. It fails closed on unreadable/corrupt records; it never substitutes a
fresh balance for damaged data. The memory adapter is only used by offline tests.
No new database dependency is required for this single-instance v1.

Local default: app/templates/sovereign-hub-ui/.data/malik-compute (git-ignored).
Server restart preserves usage when this directory survives.

On Render, attach a **persistent disk** to the service running Next.js, for example
mount it at /var/data, then set in that service's Environment:

    MALIK_COMPUTE_DATA_DIR=/var/data/malik-compute

Redeploy after setting the variable. **A variable alone does not create a disk.**
Without a disk, Render can discard usage on redeploy or instance replacement.
This repository does not create a paid resource or verify its mount.
If the hosting plan cannot attach a disk, arrange persistent storage before
relying on production quotas. Never copy API keys or ledgers to GitHub.
This adapter supports one service/volume, not independent horizontally scaled
replicas. Back up its private directory using your hosting backup policy.

Signed-in identity is the immutable server-side WorkOS ID. A guest receives a signed
HTTP-only cookie, distinct from every other guest. Guest identity is browser-local:
clearing cookies can create another allowance; use sign-in for durable identity
and separate abuse controls for public guest access.
An account and its earlier guest allowance are not merged.

## Checks and remaining scope

npm run test:compute tests the service, filesystem persistence, identity,
production routes with stub providers, SSE failure/cancellation and video completion.
Tests use temporary private files and make no paid provider calls.
npm run build checks the production Next.js build.

Provider Health and Routing Distribution are explicitly not connected. Existing
fallback attempts are counted where the router exposes them; this is not complete
provider telemetry. New endpoints must opt into withCompute with a server-owned
operation policy. There is no automatic agent or new provider.
