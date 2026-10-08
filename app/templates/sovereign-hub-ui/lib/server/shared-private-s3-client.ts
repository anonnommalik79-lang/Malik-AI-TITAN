import "server-only"

import { createHash } from "node:crypto"
import { S3Client } from "@aws-sdk/client-s3"

export type PrivateS3Connection = {
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

// Reuse one HTTP connection pool for private history and background turns.
// Allocating a fresh AWS SDK client on every chat write leaks sockets/agents
// on small always-on hosts. Keep credentials out of map keys and logs.
const clients = new Map<string, S3Client>()
const MAX_CLIENTS = 4

export function sharedPrivateS3Client(config: PrivateS3Connection): S3Client {
  const fingerprint = createHash("sha256").update(JSON.stringify([
    config.region, config.endpoint || "", config.accessKeyId,
    config.secretAccessKey, config.sessionToken || "",
  ])).digest("hex")
  const existing = clients.get(fingerprint)
  if (existing) {
    clients.delete(fingerprint)
    clients.set(fingerprint, existing)
    return existing
  }
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    },
  })
  clients.set(fingerprint, client)
  while (clients.size > MAX_CLIENTS) {
    const oldest = clients.entries().next().value as [string, S3Client] | undefined
    if (!oldest) break
    clients.delete(oldest[0])
    oldest[1].destroy()
  }
  return client
}
