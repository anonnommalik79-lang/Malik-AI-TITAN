# Durable conversation history — 2026-10-16

## Change

The owner request/reply audit and the existing private account chat-state API
can now use real PostgreSQL outside the disposable application filesystem.
No redesign: the existing history screens and account synchronization remain.

Connection priority: `FOUNDER_DATABASE_URL`, `PRIVATE_STATE_DATABASE_URL`, then
`DATABASE_URL`. The encryption key is `FOUNDER_HISTORY_SECRET` (preferred), or
the existing `WORKOS_COOKIE_PASSWORD`; at least 32 characters are required.
Never put these values in Git, NEXT_PUBLIC variables, URLs shown to users, or
support messages. Preserve the encryption key independently of deployments.
Rotating/deleting it without migrating ciphertext makes old records unreadable.

- AES-256-GCM encryption before SQL writes; owner/object keys are hashed.
- Verified TLS for external databases. Small shared pool and query deadlines.
- Additive schema initialization, serialized with a transaction advisory lock.
- One audit row per request; late pending writes cannot erase completed replies.
- Atomic compare-and-swap revisions preserve the existing multi-device merge.
- Private-state deletion leaves an encrypted tombstone, so legacy fallback does
  not resurrect deleted data. Conversation audit has no automatic expiry/TTL.
- Existing S3/disk history is still readable; reads are not a claim that every
  old record has been migrated. Local fallback is not a durable acknowledgement.
- Owner access remains server-authenticated and verified; ordinary users cannot
  read other accounts' history by supplying a different email or user ID.

## Verification

- `verify-founder-history.mjs`: 15/15 baseline storage/audit/API checks.
- `verify-history-postgres.mjs`: 11/11, actual SQL and encryption on temporary
  PGlite disk; pg transport and advisory locks are test boundaries.
- `verify-history-postgres-live.mjs`: real pg/TLS, encrypted write/read,
  concurrent CAS, health roundtrip, and a separate fresh Node process reading
  the saved records. Uses only generated synthetic canaries, then removes them.
- Streaming audit contract, account merge/CAS regression, S3 client regression.

The live test receives its connection through stdin with terminal echo disabled;
no credential is written to a source file or passed as a command-line argument.
PGlite is a dev-only test dependency, not the production database.

## Activation and operational limits

Configure the PostgreSQL URL in the hosting secret settings, preserve the
existing encryption key, and deploy the tested commit. The owner-only
`/api/founder/storage-health` must report `encrypted-postgres`, `durable: true`,
and `POSTGRES_WRITE_READ_DECRYPT_OK` after a real authenticated roundtrip.
A configured connection alone is not proof of a successful site deployment.

This protects confirmed database writes against a Render restart/replacement,
not against database deletion, quota exhaustion, key loss or provider failure.
Free hosting has quotas and no promise of unlimited storage or availability.
An independent encrypted backup is still needed for disaster recovery.

The older free Render Postgres instance has an expiry date; do not mistake it
for indefinite storage. A separate Neon Free project was created for this
feature; no paid plan or manual Render deploy was requested.

Scope is account chat snapshots and authenticated request/reply audit, not all
binary media. Existing limits still apply: 256,000 characters per audited side
(truncation is flagged), 8 MiB per private state object. Guests and direct Live
audio bypasses are not converted into retained raw recordings. Attachments,
generated video binaries and credentials are not copied into conversation logs.
History already lost from an old ephemeral instance cannot be reconstructed.
