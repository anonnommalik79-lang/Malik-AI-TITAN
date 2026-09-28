import "server-only"

import { createHash } from "node:crypto"
import { privateJsonStoreConfigured, readPrivateJson, writePrivateJson } from "./private-json-store"

type Ownership = { ownerHash: string; createdAt: number }
type Scope = typeof globalThis & { __malikMusicJobOwners?: Map<string, Ownership> }

function hashRequest(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex")
}

function hashOwner(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}

function key(requestId: string) {
  return `private/system/malik-music-jobs/${hashRequest(requestId)}.json`
}

function cache() {
  const scope = globalThis as Scope
  if (!scope.__malikMusicJobOwners) scope.__malikMusicJobOwners = new Map()
  return scope.__malikMusicJobOwners
}

export async function recordMusicJobOwner(requestId: string, ownerId: string) {
  const entry = { ownerHash: hashOwner(ownerId), createdAt: Date.now() }
  cache().set(hashRequest(requestId), entry)
  return privateJsonStoreConfigured() ? writePrivateJson(key(requestId), entry) : false
}

export async function musicJobBelongsTo(requestId: string, ownerId: string) {
  if (!requestId || requestId.length > 500 || !ownerId) return false
  const stored = cache().get(hashRequest(requestId)) || await readPrivateJson<Ownership>(key(requestId))
  return Boolean(stored && stored.ownerHash === hashOwner(ownerId))
}
