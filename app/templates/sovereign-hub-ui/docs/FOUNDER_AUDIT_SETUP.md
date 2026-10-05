# Founder request audit — production setup

The private dashboard is at `/founder/history`. Access is checked **server-side** using the signed WorkOS session and `isVerifiedOwner`. `/api/founder/activity`, `/api/founder/overview`, `/api/founder/messages`, `/api/founder/access`, and `/api/founder/storage-health` must remain owner-only.

## Persistence (required for durable history)

Without storage, the API returns `"storage":"runtime-memory"`: memory data is lost on restart/deploy. Create a private, non-public S3-compatible bucket (Cloudflare R2 is supported). Configure these in the **actual production service**:

```env
FOUNDER_HISTORY_BUCKET=<private-bucket>
FOUNDER_HISTORY_ENDPOINT=https://<your-account>.r2.cloudflarestorage.com
FOUNDER_HISTORY_REGION=auto
FOUNDER_HISTORY_ACCESS_KEY_ID=<write/read/list/delete key>
FOUNDER_HISTORY_SECRET_ACCESS_KEY=<secret>
FOUNDER_HISTORY_SECRET=<long stable independently generated encryption secret>
```

Keep credentials only in host environment variables. Never expose the bucket, journal, or API keys publicly. If the encryption key is rotated without planned re-encryption, old ciphertext cannot be read. Back up the bucket and key securely; configure data retention/deletion to match the privacy notice. Do not use `WORKOS_COOKIE_PASSWORD` as a long-term audit encryption key if you can provide `FOUNDER_HISTORY_SECRET` explicitly.

New events use one AES-256-GCM-encrypted object per request id under `private/founder/request-audit/v2/`, preventing unrelated requests from overwriting a shared history array. Previous `private/founder/message-history/` files are read for compatibility. The request is first recorded as pending; completion updates the same id. An uncompleted request older than ten minutes is displayed as interrupted/unconfirmed. In-flight writes can still be lost if the hosting process fails before the first storage write completes; there is no exactly-once guarantee across user network disconnects.

## Health / acceptance test

1. Authenticate as the real owner; open `/api/founder/storage-health` in Safari. Require `"durable":true` and `"reason":"WRITE_READ_DECRYPT_OK"`. The endpoint tests a private encrypted write/read/delete; `"storage":"encrypted-object-storage"` alone is **not** proof of working credentials.
2. Open `/founder/history`, send a new test prompt from a registered non-owner account, then refresh the page. The request must show email, prompt, answer, model (if supplied), elapsed time, and status success.
3. Trigger an ordinary failed request and a streaming interruption, verify failed/interrupted status and a redacted error reason. Check on a clean browser login as well.
4. Restart/deploy the service and verify the same entries still exist. Unverified guest requests are not linked to a real email and are intentionally excluded.
5. Ensure users are transparently informed that prompts, answers and diagnostic events may be logged for service operation, support and security, with retention and deletion rights. Restrict viewing to authorized staff. Never publish another user's private content.

`/api/founder/activity` returns the whole recorded history for registered users. Legacy volatile-only history from an already restarted Render instance cannot be backfilled.
