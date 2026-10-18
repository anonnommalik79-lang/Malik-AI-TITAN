# Native execution and recovery — 2026-10-18

This extends DOMAIN_INTELLIGENCE_20261018.md. That report records the earlier
verification snapshot, not a claim that its old build tested these later changes.

## Confirmed architectural causes

- Media routing ran before binding the primary deliverable; documents/decks were
  missing from media's non-image object guards. A stale image composer mode was
  another client-side route into media generation.
- The supplied SaaS wording did not reproduce an image call in the local base
  detector by itself. Composite deck/image requests did. Its financial-model
  wording also matched an unbounded Cyrillic `ИИ` inside `компании`, needlessly
  requesting fresh evidence. Do not claim the production incident is traced to
  a specific call without its request/receipt.
- Background results used a separate S3-only store and RAM, ignoring the
  configured private PostgreSQL/history backend. Cloud write failures were
  ignored. A 404 was incorrectly presented as an authentication error.
- OS writes can fail after optimistic cache insertion. Native file delivery now
  reads the artifact from the backing store before publishing its download link.

## Implemented

Shared primary-artifact binding, bounded typed output/dependency contracts,
real native-file verification, checked local spreadsheet formula caches and
native charts; exact requested PPTX slide counts and native numeric charts.
Explicit deck imagery uses existing paid-image/photograph providers and bounded,
DNS-pinned raster downloads; images remain dependencies, not final substitutes.
Content repair is bounded to one model call and does not replay auxiliary media.
A site + PDF-instruction request preserves the actual site and exports a manual
derived from its generated pages/configuration.

Background turns reuse encrypted private state, atomic conditional claims and
terminal-state protection. Pending text has throttled checkpoints/leases.
Owner isolation, cancellation, retry backoff and RAM limits remain enforced.
Transport failure does not automatically regenerate a paid/file-producing turn.
If the server process dies during inference, the saved partial result survives
when durable storage is configured, but inference is not magically resumed: an
expired lease becomes an explicit failed/interrupted result. No durable worker
infrastructure was provisioned by this change.

No redesign, provider migration, API-key changes, production database mutation,
or manual Render deployment was performed. Parallel presentation changes from
origin/main were merged without conflict and preserved.

## Verification and boundaries

`npm run test:native-execution` runs 25 new checks, 13 owner/store checks and
background stream survival checks. New checks run actual intent code, native
writers, independent ZIP/CRC inspection, AES encryption, conditional claims,
restart-style cache clearing and the private polling HTTP handler. Providers,
session identity and external storage transport are explicit fixtures, not live
production certification. A 24-month fixture checks 72 calculated cells and a
native chart. A 12-slide fixture checks the native editable chart and slide count.

Restricted spreadsheet formulas are local numeric formulas; cross-sheet links,
macros and external workbook/network formulas remain unsupported. Native file
structure checks do not certify all financial assumptions, arbitrary scientific
facts, visual design, or behavior in every installed Excel/PowerPoint version.
Live authenticated provider/media scenarios and actual Render restart/latency
still need a configured environment. No 100% guarantee is made.

The user subsequently authorized commit + push of both groups to main. Git hashes
and final build/lint outcomes are reported in the conversation after verification.

Final combined verification: production webpack build PASS, TypeScript PASS,
85/85 static pages; 131 domain/coordinator/document checks PASS; 25 native
execution checks PASS; 13 background ownership checks PASS; background stream
survival PASS; 93 presentation checks and 7 stream lane checks PASS. The existing
universal-intent and website-engine/experience suites also passed after the merge.
