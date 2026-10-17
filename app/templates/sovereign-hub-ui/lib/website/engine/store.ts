import "server-only"
import { randomUUID } from "node:crypto"
import { privateJsonStoreConfigured, readPrivateJsonVersioned, writePrivateJsonConditional } from "@/lib/server/private-json-store"
import { blankChecks, ENGINE_VERSION, event, terminal, type WebsiteJob } from "./types"
import { ownerKey, projectFiles, validProjectId, workspaceRoot } from "./workspace"
import type { AIPlan } from "@/lib/ai/types"

export interface VersionedStorage {
  configured(): boolean
  read<T>(key: string): Promise<{ value: T | null; etag: string | null }>
  write(key: string, value: unknown, etag: string | null): Promise<{ stored: boolean; conflict: boolean }>
}
const cloud: VersionedStorage = { configured: privateJsonStoreConfigured, read: readPrivateJsonVersioned, write: writePrivateJsonConditional }
const PREFIX = "private/website-engine/v1"
type QueueItem = { id: string; owner: string }
type Queue = { items: QueueItem[]; permits: Array<{ token: string; until: number }> }
type Index = { ids: string[] }

/** Encrypted off-host storage, no process-global source cache and no local
 * filesystem writes. CAS protects every checkpoint from duplicate workers. */
export class WebsiteStore {
  constructor(readonly storage: VersionedStorage = cloud) {}
  key(owner: string, id: string) {
    if (!/^[a-f0-9]{64}$/.test(owner) || !validProjectId(id)) throw new Error("INVALID_PROJECT_ID")
    return `${PREFIX}/${owner}/${id}.json`
  }
  async mutate<T>(key: string, change: (value: T | null) => T): Promise<T> {
    if (!this.storage.configured()) throw new Error("WEBSITE_STORAGE_NOT_CONFIGURED")
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.storage.read<T>(key)
      const next = change(current.value)
      if (Buffer.byteLength(JSON.stringify(next)) > 7_500_000) throw new Error("WEBSITE_STORAGE_LIMIT")
      const result = await this.storage.write(key, next, current.etag)
      if (result.stored) return next
      if (!result.conflict) throw new Error("WEBSITE_STORAGE_UNAVAILABLE")
    }
    throw new Error("WEBSITE_CHECKPOINT_BUSY")
  }
  async readOwner(owner: string, id: string) {
    const { value } = await this.storage.read<WebsiteJob>(this.key(owner, id))
    if (!value || value.owner !== owner || value.id !== id) return null
    return value
  }
  read(actor: string, id: string) { return this.readOwner(ownerKey(actor), id) }
  async update(owner: string, id: string, change: (job: WebsiteJob) => void) {
    return this.mutate<WebsiteJob>(this.key(owner, id), job => {
      if (!job || job.owner !== owner || job.id !== id) throw new Error("PROJECT_NOT_FOUND")
      change(job); job.revision += 1; job.updatedAt = new Date().toISOString()
      return job
    })
  }
  async enqueue(owner: string, id: string) {
    await this.mutate<Queue>(`${PREFIX}/queue.json`, current => {
      const queue = current || { items: [], permits: [] }
      if (queue.items.some(item => item.owner === owner && item.id === id)) return queue
      if (queue.items.length >= 256) throw new Error("WEBSITE_QUEUE_FULL")
      queue.items.push({ id, owner }); return queue
    })
  }
  async remove(owner: string, id: string) {
    await this.mutate<Queue>(`${PREFIX}/queue.json`, current => ({ items: (current?.items || []).filter(item => item.owner !== owner || item.id !== id), permits: current?.permits || [] }))
  }
  async candidates() {
    return (await this.storage.read<Queue>(`${PREFIX}/queue.json`)).value?.items.slice(0, 256) || []
  }
  async permit(now = Date.now()) {
    const token = randomUUID()
    await this.mutate<Queue>(`${PREFIX}/queue.json`, current => {
      const queue = current || { items: [], permits: [] }
      queue.permits = queue.permits.filter(p => p.until > now)
      if (queue.permits.length >= 2) throw new Error("WEBSITE_WORKERS_BUSY")
      queue.permits.push({ token, until: now + 90_000 }); return queue
    })
    return token
  }
  async release(token: string) {
    await this.mutate<Queue>(`${PREFIX}/queue.json`, current => ({ items: current?.items || [], permits: (current?.permits || []).filter(p => p.token !== token) }))
  }
  async create(input: { actor: string; plan: AIPlan; modelId: string; prompt: string; requestId?: string }) {
    if (!input.prompt.trim() || input.prompt.length > 28_000) throw new Error("INVALID_WEBSITE_BRIEF")
    const owner = ownerKey(input.actor)
    // Retry of a submitted turn reuses its project, not an extra model call.
    const nonce = input.requestId && validProjectId(input.requestId) ? input.requestId : randomUUID()
    const mappingKey = `${PREFIX}/${owner}/requests/${nonce}.json`
    const previousMapping = (await this.storage.read<{ id: string }>(mappingKey)).value
    if (!previousMapping && (await this.list(input.actor)).length >= 100) throw new Error("WEBSITE_ACCOUNT_PROJECT_LIMIT")
    const id = await this.mutate<{ id: string }>(mappingKey, current => current || { id: randomUUID() })
    await this.mutate<Index>(`${PREFIX}/${owner}/index.json`, current => {
      const ids = current?.ids || []
      if (ids.includes(id.id)) return { ids }
      if (ids.length >= 100) throw new Error("WEBSITE_ACCOUNT_PROJECT_LIMIT")
      return { ids: [id.id, ...ids] }
    })
    const now = new Date().toISOString()
    const job = await this.mutate<WebsiteJob>(this.key(owner, id.id), current => {
      if (current && current.originalPrompt !== input.prompt) throw new Error("IDEMPOTENCY_CONFLICT")
      return current || {
      version: ENGINE_VERSION, id: id.id, owner, actor: input.actor, plan: input.plan, modelId: input.modelId,
      workspaceRoot: workspaceRoot(id.id), prompt: input.prompt, originalPrompt: input.prompt, title: input.prompt.slice(0, 90),
      state: "queued", checkpoint: "queued", cursor: 0, repairAttempts: 0, failures: 0,
      createdAt: now, updatedAt: now, revision: 0, files: [], revisions: [], events: [], assets: [], checks: blankChecks(),
      authorizationExpiresAt: Date.now() + 15 * 60_000,
      }
    })
    if (!terminal(job.state)) await this.enqueue(owner, job.id)
    return job
  }
  async list(actor: string) {
    return (await this.storage.read<Index>(`${PREFIX}/${ownerKey(actor)}/index.json`)).value?.ids || []
  }
  async snapshot(job: WebsiteJob, summary: string) {
    const id = randomUUID()
    await this.mutate<Pick<WebsiteJob, "files" | "assets" | "design">>(`${PREFIX}/${job.owner}/${job.id}/versions/${id}.json`, current => current || { files: projectFiles(job.files), assets: job.assets, design: job.design })
    return { id, at: new Date().toISOString(), summary: summary.slice(0, 240) }
  }
  async control(actor: string, id: string, action: "cancel" | "pause" | "resume" | "edit" | "restore", prompt = "", revisionId = "") {
    const owner = ownerKey(actor)
    const base = await this.readOwner(owner, id)
    if (!base) throw new Error("PROJECT_NOT_FOUND")
    let snapshot: Awaited<ReturnType<WebsiteStore["snapshot"]>> | undefined
    let restore: WebsiteJob["files"] | undefined
    let restoredMetadata: Pick<WebsiteJob, "assets" | "design"> | undefined
    if (action === "edit" || action === "restore") {
      if (base.lease?.until && base.lease.until > Date.now()) throw new Error("PROJECT_BUSY")
      if (!terminal(base.state) && base.state !== "paused") throw new Error("PROJECT_BUSY")
      if (base.revisions.length >= 40) throw new Error("WEBSITE_VERSION_LIMIT")
      if (action === "edit" && (!prompt.trim() || prompt.length > 28_000)) throw new Error("INVALID_WEBSITE_BRIEF")
      if (action === "restore") {
        if (!base.revisions.some(r => r.id === revisionId)) throw new Error("REVISION_NOT_FOUND")
        const version = (await this.storage.read<Pick<WebsiteJob, "files" | "assets" | "design">>(`${PREFIX}/${owner}/${id}/versions/${revisionId}.json`)).value
        restore = version?.files
        if (version) restoredMetadata = { assets: version.assets, design: version.design }
        if (!restore) throw new Error("REVISION_NOT_FOUND")
      }
      snapshot = await this.snapshot(base, base.prompt)
    }
    const result = await this.update(owner, id, job => {
      if (snapshot && job.revision !== base.revision) throw new Error("PROJECT_CHANGED")
      if (action === "cancel") { job.state = "cancelled"; job.lease = undefined; event(job, "Задача отменена; исходные файлы сохранены.") }
      if (action === "pause" && !terminal(job.state)) { job.state = "paused"; job.lease = undefined; event(job, "Пауза на последнем подтверждённом этапе.") }
      if (action === "resume") {
        if (!["paused", "failed"].includes(job.state)) throw new Error("PROJECT_NOT_PAUSED")
        job.state = "resuming"; job.failures = 0; job.retryAt = undefined; job.lease = undefined; event(job, "Возобновляю с сохранённого checkpoint.")
      }
      if (snapshot) {
        job.revisions.push(snapshot); job.files = restore ? projectFiles(restore) : job.files
        job.prompt = prompt || "Проверить восстановленную версию"; job.checks = blankChecks(); job.execution = undefined
        job.state = "resuming"; job.checkpoint = restore ? "installing" : "planning"; job.cursor = 0
        job.design = restore ? restoredMetadata?.design : undefined
        if (restore) job.assets = restoredMetadata?.assets || []
        job.repairAttempts = 0; job.failures = 0
        job.error = undefined; job.retryAt = undefined; job.lease = undefined
        event(job, restore ? "Версия восстановлена; повторно проверяю файлы." : "Редактирую тот же проект; незатронутые файлы сохраняются.")
      }
    })
    if (terminal(result.state) || result.state === "paused") await this.remove(owner, id)
    else await this.enqueue(owner, id)
    return result
  }
}
export const websiteStore = new WebsiteStore()
