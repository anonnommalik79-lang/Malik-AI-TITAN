# Malik AI durable generated-image storage

Generated images should not live in Render's ephemeral `.data` directory. The production path is an S3-compatible object store (Cloudflare R2, AWS S3, Backblaze B2 S3, etc.) plus a tiny per-account image index.

## Render environment variables

Set these on the `malik-ai-sovereign` service:

```env
MEDIA_STORAGE_BUCKET=<bucket name>
MEDIA_STORAGE_REGION=auto
MEDIA_STORAGE_ENDPOINT=<S3-compatible endpoint>
MEDIA_STORAGE_ACCESS_KEY_ID=<storage access key id>
MEDIA_STORAGE_SECRET_ACCESS_KEY=<storage secret access key>
MEDIA_STORAGE_PUBLIC_BASE_URL=<stable public/custom-domain base URL>
```

For AWS S3 use the bucket region and normal S3 endpoint/public base. For Cloudflare R2 use the R2 S3 endpoint and a public/custom domain for the bucket.

## Retention model

- Generated master bytes are immutable objects under a hashed per-user namespace.
- Preview files are stored separately but are not duplicated in the account library.
- The account library stores only short URLs and metadata; image bytes never go into `localStorage`.
- No code-side TTL or deletion policy is applied to cloud objects. If the bucket has a lifecycle rule, disable expiration if images must remain indefinitely.
- Browser `localStorage` is only a small cache. On reload/login Malik AI rehydrates the image list from `/api/media/library`.

## Important

If these variables are absent, the legacy Render-local fallback remains available so image generation does not fail after provider work has already completed. Configure object storage before relying on cross-device/per-account permanence.
