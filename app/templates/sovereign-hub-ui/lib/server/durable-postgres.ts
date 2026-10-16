import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"
import { Pool, type PoolConfig } from "pg"

const MAX_BYTES = 8 * 1024 * 1024
type Database = { fingerprint: string; pool: Pool; schema?: Promise<void> }
const runtime = globalThis as typeof globalThis & { __malikHistoryDatabase?: Database }
const secret = () => (process.env.FOUNDER_HISTORY_SECRET || process.env.WORKOS_COOKIE_PASSWORD || "").trim()
const connection = () => (process.env.FOUNDER_DATABASE_URL || process.env.PRIVATE_STATE_DATABASE_URL || process.env.DATABASE_URL || "").trim()
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

export function durablePostgresConfigured() {
  return Boolean(connection()) && secret().length >= 32
}

/** Keep TLS certificate/hostname validation enabled outside local/private Render connections. */
export function historyPoolConfig(value: string): PoolConfig {
  const url = new URL(value)
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("INVALID_HISTORY_DATABASE_URL")
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  const renderInternal = process.env.RENDER === "true" && /^dpg-[a-z0-9-]+$/.test(url.hostname)
  if (!local && !renderInternal) {
    // URL SSL parameters override pg's `ssl` object. Normalize the URL itself.
    url.searchParams.set("sslmode", "verify-full")
    url.searchParams.delete("uselibpqcompat")
  }
  return {
    connectionString: url.toString(), max: 3, idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000, statement_timeout: 5_000,
    query_timeout: 6_000, application_name: "malik-private-history", allowExitOnIdle: true,
  }
}

function database() {
  if (!durablePostgresConfigured()) throw new Error("HISTORY_DATABASE_NOT_CONFIGURED")
  const value = connection(), fingerprint = hash(value)
  if (runtime.__malikHistoryDatabase?.fingerprint === fingerprint) return runtime.__malikHistoryDatabase
  const previous = runtime.__malikHistoryDatabase
  const pool = new Pool(historyPoolConfig(value))
  pool.on("error", () => console.error("[MALIK HISTORY] database connection lost"))
  const current: Database = { fingerprint, pool }
  runtime.__malikHistoryDatabase = current
  if (previous) void previous.pool.end().catch(() => {})
  return current
}

async function ready() {
  const db = database()
  db.schema ??= (async () => {
    const client = await db.pool.connect().catch(async (error: unknown) => {
      // A free serverless database may be waking from sleep. Retry only a
      // connection failure, once; never rerun arbitrary/ambiguous SQL writes.
      const code = String((error as { code?: string })?.code || "")
      const message = error instanceof Error ? error.message : ""
      if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "57P03", "08006"].includes(code) || /connection.*(?:timeout|terminated)|timeout.*connect/i.test(message)) {
        return db.pool.connect()
      }
      throw error
    })
    try {
      await client.query("BEGIN")
      // Serialize additive initialization across workers/instances, not just this process.
      await client.query("SELECT pg_advisory_xact_lock(694217031)")
      await client.query(`CREATE TABLE IF NOT EXISTS malik_founder_audit_v1 (
        owner_hash varchar(40) NOT NULL, request_id varchar(90) NOT NULL,
        created_at timestamptz NOT NULL, status varchar(16) NOT NULL,
        encrypted_payload text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_hash, request_id))`)
      await client.query("CREATE INDEX IF NOT EXISTS malik_founder_audit_owner_date ON malik_founder_audit_v1 (owner_hash, created_at, request_id)")
      await client.query(`CREATE TABLE IF NOT EXISTS malik_private_state_v1 (
        key_hash varchar(64) PRIMARY KEY, encrypted_payload text NOT NULL,
        revision uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      const code = String((error as { code?: string })?.code || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "").slice(0, 40)
      throw new Error(`HISTORY_DATABASE_SCHEMA_FAILED_${code}`, { cause: error })
    } finally { client.release() }
  })().catch(error => { db.schema = undefined; throw error })
  await db.schema
  return db.pool
}

export async function readPostgresAudit(ownerHash: string) {
  const pool = await ready()
  // Fetch bounded batches to avoid a single unbounded pg result allocation.
  const found: string[] = []
  let last: { created_at: Date; request_id: string } | undefined
  for (;;) {
    const page = await pool.query<{ encrypted_payload: string; created_at: Date; request_id: string }>(
      `SELECT encrypted_payload, created_at, request_id FROM malik_founder_audit_v1
       WHERE owner_hash=$1 ${last ? "AND (created_at,request_id)>($2,$3)" : ""}
       ORDER BY created_at,request_id LIMIT 250`, last ? [ownerHash, last.created_at, last.request_id] : [ownerHash])
    for (const row of page.rows) {
      if (Buffer.byteLength(row.encrypted_payload) > MAX_BYTES) throw new Error("HISTORY_RECORD_TOO_LARGE")
      found.push(row.encrypted_payload)
    }
    if (page.rows.length < 250) return found
    last = page.rows.at(-1)
  }
}

export async function writePostgresAudit(ownerHash: string, id: string, createdAt: string, status: string, payload: string) {
  if (Buffer.byteLength(payload) > MAX_BYTES) throw new Error("HISTORY_RECORD_TOO_LARGE")
  const pool = await ready()
  await pool.query(`INSERT INTO malik_founder_audit_v1 (owner_hash,request_id,created_at,status,encrypted_payload)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (owner_hash,request_id) DO UPDATE
    SET status=EXCLUDED.status,encrypted_payload=EXCLUDED.encrypted_payload,updated_at=now()
    WHERE malik_founder_audit_v1.status='pending' OR EXCLUDED.status<>'pending'`,
  [ownerHash, id, createdAt, status, payload])
}

/** Only the unique diagnostic canary is deleted; conversation writes never expire rows. */
export async function deletePostgresAuditCanary(ownerHash: string, id: string) {
  if (!id.startsWith("health-")) throw new Error("INVALID_HISTORY_CANARY")
  const pool = await ready()
  await pool.query("DELETE FROM malik_founder_audit_v1 WHERE owner_hash=$1 AND request_id=$2", [ownerHash, id])
}

function seal(value: unknown, keyHash: string) {
  const plain = JSON.stringify(value)
  if (typeof plain !== "string" || Buffer.byteLength(plain) > MAX_BYTES) throw new Error("PRIVATE_STATE_TOO_LARGE")
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret()).digest(), iv)
  cipher.setAAD(Buffer.from(`malik-private-postgres-v1:${keyHash}`))
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") })
}

function open<T>(payload: string, keyHash: string): T {
  if (Buffer.byteLength(payload) > MAX_BYTES * 1.5) throw new Error("PRIVATE_STATE_TOO_LARGE")
  const envelope = JSON.parse(payload)
  if (envelope.v !== 1) throw new Error("INVALID_PRIVATE_STATE_ENVELOPE")
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret()).digest(), Buffer.from(envelope.iv, "base64"))
  decipher.setAAD(Buffer.from(`malik-private-postgres-v1:${keyHash}`))
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8")) as T
}

export async function readPostgresPrivateJson<T>(key: string): Promise<{ value: T | null; etag: string | null }> {
  const pool = await ready(), keyHash = hash(key)
  const result = await pool.query<{ encrypted_payload: string; revision: string }>(
    "SELECT encrypted_payload,revision FROM malik_private_state_v1 WHERE key_hash=$1", [keyHash])
  const row = result.rows[0]
  return row ? { value: open<T>(row.encrypted_payload, keyHash), etag: row.revision } : { value: null, etag: null }
}

export async function writePostgresPrivateJson(key: string, value: unknown, previous?: string | null) {
  const pool = await ready(), keyHash = hash(key), payload = seal(value, keyHash), revision = randomUUID()
  const result = previous === undefined
    ? await pool.query(`INSERT INTO malik_private_state_v1 (key_hash,encrypted_payload,revision) VALUES ($1,$2,$3)
        ON CONFLICT (key_hash) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload,revision=EXCLUDED.revision,updated_at=now()`, [keyHash, payload, revision])
    : previous === null
      ? await pool.query("INSERT INTO malik_private_state_v1 (key_hash,encrypted_payload,revision) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [keyHash, payload, revision])
      : await pool.query("UPDATE malik_private_state_v1 SET encrypted_payload=$2,revision=$3,updated_at=now() WHERE key_hash=$1 AND revision=$4", [keyHash, payload, revision, previous])
  return { stored: result.rowCount === 1, conflict: result.rowCount === 0 }
}

export async function deletePostgresPrivateJson(key: string) {
  // An encrypted tombstone prevents legacy S3 fallback from resurrecting deletions.
  return (await writePostgresPrivateJson(key, null)).stored
}

export async function closeHistoryDatabase() {
  const db = runtime.__malikHistoryDatabase
  delete runtime.__malikHistoryDatabase
  if (db) await db.pool.end()
}
