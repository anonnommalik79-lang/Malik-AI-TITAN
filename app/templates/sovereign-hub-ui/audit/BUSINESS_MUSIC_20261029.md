# Business and music reliability — 2026-10-29

## Scope agreed with the owner

The latest correction keeps and improves **Создать трек**, keeps **Переводчик**,
and removes only **Compute** from the sidebar. Compute's internal metering and
authorization remain active. No CSS, palettes, page layout or paid resources
were changed.

## Audit findings and repairs

The active dashboard uses `AutonomousCompany` and `/api/business/agent`, not
the legacy `BusinessCommandCenter`. The active pipeline runs eight Gemini
stages, passing prior documents forward, followed by a summary. Research has
the existing grounding tool. Documents and plans are not proof of deployed
websites, contacted clients, revenue or a registered company.

### Business

- Pre-cancelled stages no longer invoke fetch or Gemini discovery.
- Cancelling a response aborts the provider, including response-body stalls.
- A terminal SSE document/error ends the client read immediately; it does not
  wait indefinitely for a transport to close after a valid terminal event.
- Empty/malformed completed documents and oversized stream frames are rejected.
- A document still truncated after the bounded continuation is not marked done.
- Invalid/null JSON, wrong field types, oversize fields and bodies fail before
  model execution. Body buffering is bounded to 1 MB. Longer prior documents
  retain their handover before the existing prompt builders compact context.
- Completed checkpoints compare actual content and brief changes, not lengths.
- Stale streams cannot overwrite a newer run; stress-test and variant timers
  are cancelled on stop/unmount. Account changes remount the business view.
- Business responses are private/no-store. Origin checks allow configured
  canonical/Render origins without trusting arbitrary forwarded hosts.

### Music

- Status polling has a 15-second deadline covering headers and JSON, including
  transports that ignore abort. Leaving the studio cancels its active poll.
- Queued extra variants cannot start after unmount.
- Unknown statuses and ready results without safe audio URLs cannot become a
  ready track. The existing browser metadata validation remains required.
- Progress stays within 0–99 until actual audio metadata is accepted.
- Playback failure is shown; download links are validated and use a filename.
- Generation providers, tariff checks, ownership checks, lyrics and quota
  semantics are preserved. No music generation was purchased by these tests.
- No MP3 proxy or audio-body buffer was added to Render.

### Compute

The menu entry is removed. Existing backend quotas remain intact. The retained
internal panel rejects inconsistent balances and stale refresh responses,
times out a stuck refresh and cleans up requests on unmount. Its MCU units
remain Malik allowance units, not provider tokens, money or investment value.
The existing filesystem ledger's persistence limitations remain; this release
does not provision a disk or migrate quotas to another database.

## Confirmed automated checks

- Business Gemini engine, section, launch, readiness and PRO suites: PASS.
- Section checks: 102/102. New business/Compute regressions: 36/36.
- Compute service: 22 checks; route integrations: 22 checks — PASS.
- Music intent and delivery suites: PASS. New music-client regressions: 23/23.
- The eight-stage + summary regression executes actual client/API boundaries
  with controlled identity/provider fixtures. It makes no paid model calls.
- Test harness repairs use real TypeScript unions/template arrays, valid
  Windows module URLs and Next's request-scoped `after()` lifecycle. They do
  not relax tariff checks or replace production handlers with fake success.

## Not certified in this run

Computer Use stopped the Edge session because it could not determine the
current browser URL confidently enough to enforce its policy. No alternative
browser automation was used to work around that stop.

Therefore no live authenticated business run, newly generated music track,
mobile/desktop visual acceptance, or screenshot of a real model-generated
business result is claimed. Those checks remain outstanding. Fixture output
must not be presented as a real provider answer. No investment/revenue
guarantee is made.
