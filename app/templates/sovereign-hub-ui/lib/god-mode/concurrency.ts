import "server-only"

import { createHash, randomUUID } from "node:crypto"

type Lease = { id: string; expiresAt: number }
type LeaseGlobal = typeof globalThis & { __malikGodLeases?: Map<string, Lease[]> }

function leases() {
  const scope = globalThis as LeaseGlobal
  if (!scope.__malikGodLeases) scope.__malikGodLeases = new Map()
  return scope.__malikGodLeases
}

function leaseKey(ownerId: string, capability: string) {
  const owner = createHash("sha256").update(String(ownerId || "guest").toLowerCase()).digest("hex").slice(0, 24)
  const lane = String(capability || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 64)
  return owner + ":" + lane
}

function cleanup(key: string, now = Date.now()) {
  const active = (leases().get(key) || []).filter((item) => item.expiresAt > now)
  if (active.length) leases().set(key, active)
  else leases().delete(key)
  return active
}

export function acquireGodLease(ownerId: string, capability: string, options: { limit?: number; ttlMs?: number } = {}) {
  const key = leaseKey(ownerId, capability)
  const limit = Math.max(1, Math.min(8, Math.floor(options.limit || 1)))
  const ttlMs = Math.max(5_000, Math.min(30 * 60_000, Math.floor(options.ttlMs || 10 * 60_000)))
  const active = cleanup(key)
  if (active.length >= limit) return null
  const lease: Lease = { id: randomUUID(), expiresAt: Date.now() + ttlMs }
  active.push(lease)
  leases().set(key, active)
  let released = false
  return {
    id: lease.id,
    release() {
      if (released) return
      released = true
      const next = cleanup(key).filter((item) => item.id !== lease.id)
      if (next.length) leases().set(key, next)
      else leases().delete(key)
    },
  }
}

export function concurrencySnapshot() {
  const now = Date.now()
  return [...leases().entries()].map(([key]) => ({ key: key.split(":").at(-1), active: cleanup(key, now).length })).filter((item) => item.active > 0)
}
