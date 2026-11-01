# Chat project delivery — 2026-11-01

Base: `61dee8dc` (`origin/main` when work started).
Branch: `codex/chat-file-delivery-20261101`.

## Reproduced failures

- The project endpoint used an uncompressed ZIP. A valid large UTF-8 source
  bundle exceeded the existing 900,000-byte Render response guard and returned
  413 even though the same source compressed below that limit.
- Saved projects retained references to caller-owned arrays. Editing the input
  or a returned object silently changed subsequent downloads.
- Cache eviction counted projects, not their bytes. Persisted records were
  restored without validating their ID, file paths, source size or checksum.
- An invalid ID was silently sanitized into an existing private object's key.
- A failed configured storage write was ignored; a storage read outage became
  a false missing-file 404.
- Fresh proof timestamps changed archive bytes on every download. There was no
  stable archive identity or resumable byte-range response.

## Implemented in the existing project lane

- Reuse the existing server document ZIP writer's Deflate support. Apply the
  unchanged bandwidth guard to the complete compressed ZIP before ranges.
- Return immutable JSON snapshots; validate all file paths and reject duplicate
  extraction paths, including case and Unicode-normalization collisions.
- Bound accepted source to 4 MiB, records to 6 MiB and cached payload estimates
  to 16 MiB (two times serialized UTF-8 bytes), retaining the 48-entry cap.
  This is a cache estimate, not a process RSS guarantee.
- Bind new saved records to a SHA-256 checksum; check their owner, exact ID,
  structure, expiry, size and checksum before delivering them. Legacy records
  remain readable after structural validation.
- Require confirmation of a write when durable storage is configured. Keep
  the existing temporary fallback when no durable storage is configured.
  Return retryable 503 on a read outage without deleting or replacing data.
- Pin generated proof metadata and ZIP timestamps to the saved artifact time.
  Preserve existing verified Self-Build receipts and never invent build PASS.
- Add HEAD, stable SHA-256 ETag, owner-checked conditional GET, UTF-8 attachment
  names and bounded single-range resume, including If-Range version checks.
  Unsupported range units/multiple ranges receive the complete representation.
  HTTP reference: [RFC 9110](https://httpwg.org/specs/rfc9110.html#field.range).
- Add an independent path-filtered GitHub Actions regression workflow. The
  existing production workflow and shared package scripts are unchanged.

## Executed verification

The exact same 38 delivery assertions ran against real production modules from
the baseline and the changed code: **7/38 before → 38/38 after**. Only storage
I/O and entitlement resolution are isolated fixtures; generated answers or
pretend tool receipts are not substituted as evidence of product intelligence.

- Delivery plus existing project-passport tests: **43/43 PASS**.
- Existing Self-Build tests: **7/7 PASS**.
- Existing chat artifact/code routing tests and core-hardening contracts: PASS.
- Final targeted lint: **0 errors, 0 warnings**.
- An actual response ZIP was written to disk and independently reopened with
  .NET ZipArchive. All three source files, including nested Unicode paths and
  UTF-8 content, matched. The test's separate parser also checked ZIP CRCs.
- Two partial HTTP responses reassembled into the exact complete ZIP bytes.
- Final integrated production build: **PASS**, exit 0, including TypeScript
  and page generation (one local Next worker; production config unchanged).

Reproduce from `app/templates/sovereign-hub-ui` with Node 22:

```sh
node --test scripts/verify-project-delivery.mjs scripts/verify-project-passports.mjs
node --test scripts/verify-selfbuild.mjs
npm run test:chat-artifacts
npm run test:core-hardening
npm run build -- --webpack
```

## Scope and limits

- No TSX, CSS, dashboard, Stop behavior, Markdown rendering, animations, model
  selection, self-check routing or voice file changed. Claude's named work is
  outside this branch. No claim of visual/browser verification is made.
- This changes the existing server-backed project ZIP lane, not every native
  document export or every browser-only Markdown code download.
- Private storage was not provisioned or reconfigured. Real cloud outage and
  durability checks remain operational checks; tests use isolated storage I/O.
- The existing 24-hour artifact expiry remains. Cache-only fallback does not
  survive a restart; eviction of durable records does not delete cloud data.
- Checksums detect accidental changes; they are not signatures or attestations
  that generated code is correct. Legacy records lack the new saved checksum.
- Incompressible archives exceeding the existing response budget still return
  413. No new model calls, API keys, dependencies or production deploy added.
- Render auto-deploy was checked as disabled before preparing main publication.
