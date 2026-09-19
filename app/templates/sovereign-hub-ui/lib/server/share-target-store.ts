import "server-only"

import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { computeDirectory } from "@/lib/malik-compute/file-store"

export type SharedTargetFile = {
  name: string
  mime: string
  size: number
  base64: string
}

type StoredShareTarget = {
  token: string
  userId: string
  createdAt: number
  expiresAt: number
  title?: string
  text?: string
  url?: string
  files: SharedTargetFile[]
}

const TTL_MS = 10 * 60 * 1000

function directory() {
  const dir = path.join(computeDirectory(), "share-target")
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

function tokenPath(token: string) {
  return path.join(directory(), `${token}.json`)
}

function safeToken(value: unknown) {
  const token = String(value || "").trim()
  return /^[a-f0-9-]{36}$/i.test(token) ? token : ""
}

export function saveShareTarget(input: Omit<StoredShareTarget, "token" | "createdAt" | "expiresAt">) {
  const token = randomUUID()
  const now = Date.now()
  const payload: StoredShareTarget = {
    ...input,
    token,
    createdAt: now,
    expiresAt: now + TTL_MS,
  }
  writeFileSync(tokenPath(token), JSON.stringify(payload), { encoding: "utf8", mode: 0o600 })
  return token
}

export function consumeShareTarget(rawToken: unknown, userId: string) {
  const token = safeToken(rawToken)
  if (!token) return null
  const file = tokenPath(token)
  if (!existsSync(file)) return null

  try {
    const payload = JSON.parse(readFileSync(file, "utf8")) as StoredShareTarget
    rmSync(file, { force: true })
    if (payload.userId !== userId || payload.expiresAt <= Date.now()) return null
    return payload
  } catch {
    try { rmSync(file, { force: true }) } catch {}
    return null
  }
}
