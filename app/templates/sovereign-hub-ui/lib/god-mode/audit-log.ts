import "server-only"

import { createHash, randomUUID } from "node:crypto"

import { readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"
import { redactMetadata } from "./security"

export type GodAuditEvent = {
  id: string
  at: string
  ownerHash: string
  category: "security" | "project" | "provider" | "admin" | "generation"
  action: string
  success: boolean
  traceId?: string
  resourceId?: string
  metadata?: unknown
}

type AuditGlobal = typeof globalThis & { __malikGodAudit?: Map<string, GodAuditEvent[]> }
const MAX_EVENTS_PER_DAY = 500

function store() {
  const scope = globalThis as AuditGlobal
  if (!scope.__malikGodAudit) scope.__malikGodAudit = new Map()
  return scope.__malikGodAudit
}

function hashOwner(ownerId: string) {
  return createHash("sha256").update(String(ownerId || "guest").trim().toLowerCase()).digest("hex")
}

function day() {
  return new Date().toISOString().slice(0, 10)
}

function key(ownerId: string, date = day()) {
  return `private/system/malik-god-audit/${hashOwner(ownerId)}/${date}.json`
}

export async function appendGodAudit(ownerId: string, input: Omit<GodAuditEvent, "id" | "at" | "ownerHash">) {
  const storageKey = key(ownerId)
  const cached = store().get(storageKey)
  const current = cached || await readPrivateJson<GodAuditEvent[]>(storageKey) || []
  const event: GodAuditEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ownerHash: hashOwner(ownerId),
    category: input.category,
    action: String(input.action || "unknown").slice(0, 100),
    success: Boolean(input.success),
    traceId: input.traceId?.slice(0, 100),
    resourceId: input.resourceId?.slice(0, 180),
    metadata: redactMetadata(input.metadata),
  }
  const next = [...current, event].slice(-MAX_EVENTS_PER_DAY)
  store().set(storageKey, next)
  await writePrivateJson(storageKey, next)
  console.info("[MALIK_AUDIT]", JSON.stringify({ id: event.id, at: event.at, category: event.category, action: event.action, success: event.success, traceId: event.traceId }))
  return event
}

export async function readGodAudit(ownerId: string, date = day()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  const storageKey = key(ownerId, date)
  return store().get(storageKey) || await readPrivateJson<GodAuditEvent[]>(storageKey) || []
}
