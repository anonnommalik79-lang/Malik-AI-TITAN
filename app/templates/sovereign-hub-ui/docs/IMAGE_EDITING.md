# Uploaded image editing

Attach one PNG, JPEG or WebP to a chat message and submit an instruction such as
“Убери человека справа”, “Замени фон на море” or “Напиши на фото: С днём рождения”.
The image and the instruction must be sent together. Follow-up edits without
reattaching the original are not implemented.

The dashboard detects edit intent, skips the text-only prompt interpreter and
sends operation=edit. The shared image endpoint validates the original, corrects
EXIF orientation and passes actual image bytes as multipart input_image_0.
It uses Cloudflare FLUX.2 Klein, or FLUX.2 Dev when explicitly selected by an
eligible account. Unsupported selected models are routed to Klein for edits.
No text-only generation fallback is used if editing fails.

## Configuration

Use the existing Cloudflare account and token environment variables:
CLOUDFLARE_IMAGE_ACCOUNT_ID / CLOUDFLARE_IMAGE_API_TOKEN, or their existing
CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN aliases. The account must have
Workers AI access to the selected model. Never expose the token to the browser.

## Limits and honesty

- One uploaded image; at most 12 MiB, 40 megapixels, aspect ratio at most 4:1.
- PNG, JPEG and non-animated WebP only. Remote image URLs are not fetched.
- The complete source frame is preserved as a reference, resized within 512×512
  for the provider. Output is approximately 1024 pixels on its longer edge.
- The existing output upscaler is separate from model-native resolution.
  Upscaling is not native 8K/16K generation and cannot guarantee recovered detail.
- Edits are generative, not pixel-locked: identity, exact typography and unchanged
  regions still require visual review. No mask/brush editor is included.

## Verification

Run npm run test:image-edit and npm run typecheck. The edit test verifies intent,
image decoding, limits, multipart image bytes, provider selection, failure
behavior and the API response using mocked provider/network calls.

Live visual acceptance still requires a configured Cloudflare account: test
removal, replacement, addition and Cyrillic lettering with an uploaded original.
Check that errors stop the loader and never return an unrelated generated image.

Provider documentation:
https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/
https://developers.cloudflare.com/changelog/post/2025-11-25-flux-2-dev-workers-ai/
