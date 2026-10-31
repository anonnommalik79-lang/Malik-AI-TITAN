# MALIK AI image watermark — 2026-10-31

## Root causes

The existing compositor painted a bottom-left triangle icon, without the
requested MALIK AI lettering. Its catch block returned unprocessed provider
bytes on failure. The photo API could expose the original provider URL in
`imageUrl`, or substitute a smaller preview for the master when object storage
was unavailable. Template covers and legacy image response paths had separate
delivery boundaries. An optional browser download button applied another stamp.

## Delivery contract

- One shared Node compositor paints the exact outlined text **MALIK AI** in the
  bottom-right corner, at 60% opacity, with 2.5% edge margins. Its size follows
  the shorter image dimension. White/black is selected from a bounded sample of
  the corner's luminance. Outlined lettering needs no system font on Render.
- The stamp is composited after output sizing/effects and before encoding and
  storage. Generated photos/edits, direct-provider delivery, Work images,
  template covers and legacy AI image responses all finalize their pixels.
- XMP identifies this application's stamped outputs. Native-size repeat
  processing returns identical bytes. Preview conversion retains the marker;
  the download button no longer applies another browser stamp. This marker is
  an idempotency hint, not cryptographic provenance or tamper detection.
- All public photo references use processed bytes. Storage failure returns a
  full branded inline master plus a branded small preview, never the raw
  provider image. Chat saves separate master/preview browser entries and keeps
  the existing toolbar's master reference when resolving a gallery image.
- A processing failure returns an error, without declaring an unbranded photo
  ready or charging image credits. Branding failure does not trigger another
  paid generation in the legacy provider finalizer.
- The legacy Flask bridge/async image jobs use a Pillow adapter and the same
  wordmark artwork. Local bytes are branded before storage; remote OpenAI
  results are downloaded with a byte limit and branded before delivery.
- User prompts, LLM selection, voice and video generation are unchanged.
  No new Render-local image store, media proxy, model call or production deploy
  was introduced.

## Executed verification

- `npm run test:image-watermark`: **35/35 PASS**. Real Sharp processing of PNG,
  JPEG and WebP; portrait/square/wide, white/dark/transparent backgrounds, EXIF
  rotation, 4K, narrow/wide/tiny inputs, unchanged native dimensions, 60% pixel
  contrast and lossless pixels outside the PNG signature. Repeat application
  must preserve identical bytes.
- Both actual Next image POST handlers execute through the real compositor
  with controlled identity/provider/storage fixtures. Every returned reference
  is decoded and checked. Object-storage success/failure, no storage, HTTP
  download, disk reopen, master/preview links, failed processing/credit handling
  and browser-cache account isolation are covered. No paid provider was called.
- `python scripts/verify_image_watermark.py`: **24/24 PASS**. Actual saved and
  reopened legacy PNG/JPEG/WebP files, remote/local output finalization,
  idempotency and failure without another provider purchase.
- `python scripts/verify_image_jobs.py`: **PASS**.
- Existing image memory/quality/edit/prompt/credit checks and branding checks
  were executed. Tests that required the old bottom-left triangles now assert
  the requested wordmark; their video contracts remain unchanged. The edit
  regression now uses the real compositor rather than an unprocessed stub.
- TypeScript: **PASS**, both standalone in the clean QA copy and as part of
  the production build. Targeted image-module/Studio ESLint: **PASS**, 0 errors.
- Full build guards and `next build --webpack`: **PASS** (85 static pages).
  Production provider credentials were not used; WorkOS build placeholders
  were supplied only to the isolated QA process.

Actual HTTP-downloaded and reopened evidence, plus a visually inspected
existing-photo example, were saved outside git under
`C:/Users/HUAWEI/Documents/Codex/QA/watermark-20261031/`.

## Limits

These checks use controlled provider/storage responses, not newly purchased
model images or the production account. Browser cache reopening is a controlled
IndexedDB regression, not an authenticated browser-session acceptance test.
Existing historical files are not retroactively modified. Repeat-stamp
prevention relies on retained metadata; arbitrary third-party editing that
strips it is outside that contract. Cross-device HTTP sharing/persistence still
requires the existing object storage; an inline/local-browser fallback cannot
replace a configured durable bucket. This change does not provision storage.

## Changed files (repository-relative)

```text
app/ai/media_jobs/providers.py
app/ai/media_jobs/watermark.py
app/ai/media_jobs/malik-wordmark.png
app/requirements.txt
requirements.txt
scripts/verify_image_watermark.py
app/templates/sovereign-hub-ui/lib/media/malik-watermark.ts
app/templates/sovereign-hub-ui/lib/media/finalize-image-response.ts
app/templates/sovereign-hub-ui/lib/media/image-postprocess.ts
app/templates/sovereign-hub-ui/lib/media/image-display-preview.ts
app/templates/sovereign-hub-ui/lib/media/generate-photo-route.ts
app/templates/sovereign-hub-ui/lib/media/browser-watermark.ts
app/templates/sovereign-hub-ui/lib/media/client-generated-image-store.ts
app/templates/sovereign-hub-ui/lib/media/providers/titan-image.ts
app/templates/sovereign-hub-ui/lib/ai/providers/image.ts
app/templates/sovereign-hub-ui/lib/ai/providers/aws-bedrock.ts
app/templates/sovereign-hub-ui/lib/ai/providers/bedrock-image-provider.ts
app/templates/sovereign-hub-ui/lib/os/runtime.ts
app/templates/sovereign-hub-ui/app/api/media/image/templates/route.ts
app/templates/sovereign-hub-ui/components/sovereign/dashboard.tsx
app/templates/sovereign-hub-ui/components/sovereign/image-studio/ImageStudio.tsx
app/templates/sovereign-hub-ui/package.json
app/templates/sovereign-hub-ui/scripts/verify-image-watermark.mjs
app/templates/sovereign-hub-ui/scripts/verify-image-edit.mjs
app/templates/sovereign-hub-ui/scripts/verify-image-memory-safety.mjs
app/templates/sovereign-hub-ui/scripts/verify-maliki-branding.mjs
app/templates/sovereign-hub-ui/audit/IMAGE_WATERMARK_20261031.md
```
