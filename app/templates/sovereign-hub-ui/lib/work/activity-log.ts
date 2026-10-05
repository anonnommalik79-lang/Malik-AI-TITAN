import "server-only"
import { randomUUID } from "node:crypto"
import { readOwnerJson, writeOwnerJson, ownerKey } from "@/lib/os/store"
export type WorkActivity = { id: string; at: number; action: string; ok: boolean; durationMs: number; code?: string; subject?: string }
const scope = globalThis as typeof globalThis & { __malikWorkLogWrites?: Map<string, Promise<unknown>> }
/** Operational receipts only: never request bodies, provider errors or credentials. */
export async function recordWorkActivity(ownerId: string, data: Omit<WorkActivity, "id" | "at">) {
  const locks = scope.__malikWorkLogWrites ||= new Map(), key = ownerKey(ownerId)
  const previous = locks.get(key) || Promise.resolve()
  const write = previous.catch(() => undefined).then(async () => {
    const existing = await readOwnerJson<WorkActivity[]>(ownerId, "work-activity") || []
    await writeOwnerJson(ownerId, "work-activity", [...existing, { ...data, id: randomUUID(), at: Date.now() }].slice(-200))
  })
  locks.set(key, write)
  try { await write } finally { if (locks.get(key) === write) locks.delete(key) }
}
