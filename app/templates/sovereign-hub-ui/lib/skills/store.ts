import "server-only"
import { createHash } from "node:crypto"
import { privateJsonStoreConfigured, readPrivateJsonVersioned, writePrivateJsonConditional } from "@/lib/server/private-json-store"
import { SkillError, type SkillRun, type SkillStore } from "./types"

export const skillOwnerKey = (id: string) => createHash("sha256").update(id).digest("hex")
export const skillHash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex")
export const validSkillRunId = (id: unknown): id is string => typeof id === "string" && /^skill_[a-f0-9]{32}$/u.test(id)
const MAX_RECORD = 3 * 1024 * 1024, MAX_CACHE = 12 * 1024 * 1024
function key(owner: string, id: string) {
  if (!/^[a-f0-9]{64}$/u.test(owner) || !validSkillRunId(id)) throw new SkillError("INVALID_RUN_ID", 400)
  return `private/system/malik-skills/v1/${owner}/${id}.json`
}
export function checkSkillRecord(run: SkillRun, owner: string, id: string) {
  if (!run || run.version !== "malik-skills/1" || run.id !== id || run.owner !== owner || !Array.isArray(run.steps) || run.steps.length > 12
    || JSON.stringify(run).length > MAX_RECORD || !run.budget || !Number.isFinite(run.budget.tokens) || !Number.isFinite(run.expiresAt)) throw new SkillError("CORRUPT_RUN", 503)
  for (const step of run.steps) if (step.status === "completed" && (!step.output || step.outputHash !== skillHash(step.output))) throw new SkillError("CORRUPT_CHECKPOINT", 503)
  return run
}
type Entry = { json: string; revision: string; expiresAt: number }
/** Bounded fallback, explicitly NOT restart-durable. No files on Render. */
export function memorySkillStore(): SkillStore {
  const records = new Map<string, Entry>()
  return {
    durable: false,
    async read(owner, id) {
      const name = key(owner, id), item = records.get(name)
      if (item && item.expiresAt <= Date.now()) records.delete(name)
      const entry = records.get(name)
      return { value: entry ? checkSkillRecord(JSON.parse(entry.json), owner, id) : null, revision: entry?.revision || null }
    },
    async write(owner, id, value, revision) {
      checkSkillRecord(value, owner, id)
      const name = key(owner, id), current = records.get(name)
      if ((current?.revision || null) !== revision) return false
      const json = JSON.stringify(value)
      if (Buffer.byteLength(json) > MAX_RECORD) throw new SkillError("CHECKPOINT_TOO_LARGE", 413)
      const required = Buffer.byteLength(json) * 2
      let bytes = [...records.values()].reduce((n, e) => n + Buffer.byteLength(e.json) * 2, 0) - (current ? Buffer.byteLength(current.json) * 2 : 0)
      for (const [oldKey, entry] of records) {
        if (oldKey === name) continue
        // Never evict an active lease to accept another task.
        const old = JSON.parse(entry.json) as SkillRun
        if (entry.expiresAt <= Date.now() || !old.lease || old.lease.until < Date.now()) {
          if (bytes + required <= MAX_CACHE && records.size < 48 && entry.expiresAt > Date.now()) continue
          records.delete(oldKey); bytes -= Buffer.byteLength(entry.json) * 2
        }
      }
      if (bytes + required > MAX_CACHE || !current && records.size >= 48) throw new SkillError("SKILL_CAPACITY", 429, true)
      records.set(name, { json, revision: skillHash(json), expiresAt: value.expiresAt }); return true
    },
  }
}
const scope = globalThis as typeof globalThis & { __malikSkillMemory?: SkillStore }
export function skillStore(): SkillStore {
  if (!privateJsonStoreConfigured()) return scope.__malikSkillMemory ||= memorySkillStore()
  return {
    durable: true,
    async read(owner, id) {
      const loaded = await readPrivateJsonVersioned<SkillRun>(key(owner, id)).catch(() => { throw new SkillError("SKILL_STORAGE_UNAVAILABLE", 503, true) })
      return { value: loaded.value ? checkSkillRecord(loaded.value, owner, id) : null, revision: loaded.etag }
    },
    async write(owner, id, value, revision) {
      checkSkillRecord(value, owner, id)
      if (Buffer.byteLength(JSON.stringify(value)) > MAX_RECORD) throw new SkillError("CHECKPOINT_TOO_LARGE", 413)
      const result = await writePrivateJsonConditional(key(owner, id), value, revision)
      if (!result.stored && !result.conflict) throw new SkillError("SKILL_STORAGE_UNAVAILABLE", 503, true)
      return result.stored
    },
  }
}
