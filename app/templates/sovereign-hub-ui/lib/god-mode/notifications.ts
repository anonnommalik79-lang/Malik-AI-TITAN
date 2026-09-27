import "server-only"

import { createHash, randomUUID } from "node:crypto"

import { readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"

export type GodNotification = {
  id: string
  at: string
  type: "task-completed" | "task-failed" | "task-cancelled" | "project-ready" | "warning"
  title: string
  message: string
  projectId?: string
  taskId?: string
  read: boolean
}

type Global = typeof globalThis & { __malikGodNotifications?: Map<string, GodNotification[]> }
const MAX_NOTIFICATIONS = 120

function store() {
  const scope = globalThis as Global
  if (!scope.__malikGodNotifications) scope.__malikGodNotifications = new Map()
  return scope.__malikGodNotifications
}

function ownerHash(ownerId: string) {
  return createHash("sha256").update(String(ownerId || "guest").trim().toLowerCase()).digest("hex")
}

function key(ownerId: string) {
  return `private/system/malik-god-notifications/${ownerHash(ownerId)}.json`
}

async function read(ownerId: string) {
  const storageKey = key(ownerId)
  const cached = store().get(storageKey)
  if (cached) return structuredClone(cached)
  const stored = await readPrivateJson<GodNotification[]>(storageKey)
  const safe = Array.isArray(stored) ? stored.slice(-MAX_NOTIFICATIONS) : []
  store().set(storageKey, safe)
  return structuredClone(safe)
}

async function persist(ownerId: string, items: GodNotification[]) {
  const storageKey = key(ownerId)
  const safe = items.slice(-MAX_NOTIFICATIONS)
  store().set(storageKey, structuredClone(safe))
  await writePrivateJson(storageKey, safe)
  return structuredClone(safe)
}

export async function pushGodNotification(ownerId: string, input: Omit<GodNotification, "id" | "at" | "read">) {
  const items = await read(ownerId)
  const item: GodNotification = {
    id: randomUUID(),
    at: new Date().toISOString(),
    read: false,
    ...input,
    title: String(input.title || "Malik AI").slice(0, 120),
    message: String(input.message || "").slice(0, 300),
  }
  await persist(ownerId, [...items, item])
  return item
}

export async function listGodNotifications(ownerId: string) {
  return (await read(ownerId)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export async function markGodNotificationRead(ownerId: string, id: string) {
  const items = await read(ownerId)
  let found = false
  for (const item of items) {
    if (item.id === id) { item.read = true; found = true }
  }
  if (found) await persist(ownerId, items)
  return found
}

export async function markAllGodNotificationsRead(ownerId: string) {
  const items = await read(ownerId)
  items.forEach((item) => { item.read = true })
  await persist(ownerId, items)
  return items.length
}
