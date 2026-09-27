import { createHash, randomUUID } from "node:crypto"

import {
  MAX_INLINE_ARTIFACT_CHARS,
  summarizeArtifact,
  type Artifact,
  type ArtifactKind,
  type ArtifactLink,
  type ArtifactSummary,
  type FlowStatus,
  type OsFlow,
  type OsProject,
} from "./types"

/**
 * Project memory: projects, flows and artifacts, per account.
 *
 * Every account has one small index (what exists, for lists and search) and
 * one object per project, flow and artifact. Media never lives here — only
 * its URL in object storage. Writes to the same key are serialized and
 * coalesced (the latest value wins, one write at a time), so parallel tasks
 * finishing together cannot interleave and lose each other's updates.
 *
 * Storage is the private JSON store (S3/R2) when it is configured. Without
 * it the store keeps everything in this process and says so
 * (`durable: false`): results survive until the server restarts, and the
 * interface is told, instead of pretending they were saved.
 */

export type OsBackend = {
  durable: boolean
  read<T>(key: string): Promise<T | null>
  write(key: string, value: unknown): Promise<boolean>
  remove(key: string): Promise<boolean>
}

export function memoryBackend(): OsBackend {
  const data = new Map<string, string>()
  return {
    durable: false,
    async read<T>(key: string) {
      const raw = data.get(key)
      return raw ? (JSON.parse(raw) as T) : null
    },
    async write(key: string, value: unknown) {
      data.set(key, JSON.stringify(value))
      return true
    },
    async remove(key: string) {
      return data.delete(key)
    },
  }
}

type StoreGlobal = typeof globalThis & {
  __malikOsBackend?: OsBackend | null
  __malikOsOwners?: Map<string, OwnerState>
  __malikOsWrites?: Map<string, WriteSlot>
}

const scope = globalThis as StoreGlobal

/** Tests and special deployments can supply their own storage. */
export function configureOsBackend(backend: OsBackend | null) {
  scope.__malikOsBackend = backend
  scope.__malikOsOwners = new Map()
  scope.__malikOsWrites = new Map()
}

async function backend(): Promise<OsBackend> {
  if (scope.__malikOsBackend) return scope.__malikOsBackend
  const store = await import("@/lib/server/private-json-store")
  scope.__malikOsBackend = store.privateJsonStoreConfigured()
    ? {
        durable: true,
        read: store.readPrivateJson,
        write: store.writePrivateJson,
        remove: store.deletePrivateJson,
      }
    : memoryBackend()
  return scope.__malikOsBackend
}

export async function storeIsDurable() {
  return (await backend()).durable
}

/* ------------------------------------------------------------- the index */

export type ArtifactIndexEntry = Pick<Artifact, "id" | "projectId" | "kind" | "title" | "createdAt" | "sourceTool" | "url" | "fallback" | "version"> & {
  summary: string
  links: ArtifactLink[]
  keywords: string
  bytes?: number
  score?: number
}

export type FlowIndexEntry = {
  id: string
  projectId: string
  goal: string
  status: FlowStatus
  createdAt: number
  updatedAt: number
  clientRequestId: string
  chatId?: string
  taskCount: number
  artifactCount: number
}

export type ProjectIndexEntry = { id: string; title: string; goal: string; createdAt: number; updatedAt: number; artifactCount: number; chatId?: string }

export type OwnerIndex = {
  version: 1
  projects: ProjectIndexEntry[]
  flows: FlowIndexEntry[]
  artifacts: ArtifactIndexEntry[]
}

const LIMITS = { projects: 120, flows: 240, artifacts: 900 }

type OwnerState = {
  index: OwnerIndex
  projects: Map<string, OsProject>
  flows: Map<string, OsFlow>
  artifacts: Map<string, Artifact>
}

export function ownerKey(ownerId: string) {
  return createHash("sha256").update(String(ownerId || "guest").trim().toLowerCase()).digest("hex").slice(0, 40)
}

const ID = /^[a-zA-Z0-9_-]{3,80}$/

export function isOsId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value)
}

export function newId(prefix: "flow" | "proj" | "art") {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`
}

function root(ownerId: string) {
  return `private/system/malik-os/v1/${ownerKey(ownerId)}`
}

function key(ownerId: string, kind: "index" | "flows" | "projects" | "artifacts", id = "") {
  if (kind === "index") return `${root(ownerId)}/index.json`
  if (!isOsId(id)) throw new Error("INVALID_OS_ID")
  return `${root(ownerId)}/${kind}/${id}.json`
}

function owners() {
  if (!scope.__malikOsOwners) scope.__malikOsOwners = new Map()
  return scope.__malikOsOwners
}

async function ownerState(ownerId: string): Promise<OwnerState> {
  const id = ownerKey(ownerId)
  const cached = owners().get(id)
  if (cached) return cached
  const stored = await (await backend()).read<OwnerIndex>(key(ownerId, "index"))
  const state: OwnerState = {
    index: stored && stored.version === 1
      ? { version: 1, projects: stored.projects || [], flows: stored.flows || [], artifacts: stored.artifacts || [] }
      : { version: 1, projects: [], flows: [], artifacts: [] },
    projects: new Map(),
    flows: new Map(),
    artifacts: new Map(),
  }
  // Another request may have loaded it while this one waited.
  const raced = owners().get(id)
  if (raced) return raced
  owners().set(id, state)
  return state
}

/* ------------------------------------------------------ serialized writes */

type WriteSlot = { running: Promise<void> | null; pending: { value: unknown } | null }

function writes() {
  if (!scope.__malikOsWrites) scope.__malikOsWrites = new Map()
  return scope.__malikOsWrites
}

/**
 * Writes `value` to `target`. While a write to the same key is in flight,
 * later values wait and only the newest one is written afterwards.
 */
function persist(target: string, value: unknown): Promise<void> {
  const slots = writes()
  let slot = slots.get(target)
  if (!slot) {
    slot = { running: null, pending: null }
    slots.set(target, slot)
  }
  slot.pending = { value: JSON.parse(JSON.stringify(value)) }
  if (slot.running) return slot.running
  const current = slot
  const drain = async () => {
    const store = await backend()
    while (current.pending) {
      const next = current.pending
      current.pending = null
      try {
        await store.write(target, next.value)
      } catch (error) {
        console.warn("[MALIK_OS] write failed", target.split("/").slice(-2).join("/"), error instanceof Error ? error.message : String(error))
      }
    }
    current.running = null
    slots.delete(target)
  }
  current.running = drain()
  return current.running
}

/** Resolves when every write started so far has reached storage. */
export async function flushWrites() {
  for (let round = 0; round < 10; round += 1) {
    const running = [...writes().values()].map((slot) => slot.running).filter(Boolean)
    if (!running.length) return
    await Promise.all(running)
  }
}

function persistIndex(ownerId: string, state: OwnerState) {
  state.index.projects = state.index.projects.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LIMITS.projects)
  state.index.flows = state.index.flows.sort((a, b) => b.createdAt - a.createdAt).slice(0, LIMITS.flows)
  state.index.artifacts = state.index.artifacts.sort((a, b) => b.createdAt - a.createdAt).slice(0, LIMITS.artifacts)
  return persist(key(ownerId, "index"), state.index)
}

/* --------------------------------------------------------------- projects */

export async function createProject(ownerId: string, input: { title: string; goal: string; chatId?: string }, now = Date.now()) {
  const state = await ownerState(ownerId)
  const project: OsProject = {
    id: newId("proj"),
    ownerId: ownerKey(ownerId),
    title: clean(input.title, 120) || "Проект",
    goal: clean(input.goal, 4_000),
    createdAt: now,
    updatedAt: now,
    chatId: input.chatId && isOsIdLoose(input.chatId) ? input.chatId : undefined,
    decisions: [],
    sources: [],
    artifactIds: [],
    flowIds: [],
    facts: {},
  }
  state.projects.set(project.id, project)
  state.index.projects.unshift(projectEntry(project))
  await Promise.all([persist(key(ownerId, "projects", project.id), project), persistIndex(ownerId, state)])
  return project
}

export async function getProject(ownerId: string, projectId: string): Promise<OsProject | null> {
  if (!isOsId(projectId)) return null
  const state = await ownerState(ownerId)
  const cached = state.projects.get(projectId)
  if (cached) return cached
  const stored = await (await backend()).read<OsProject>(key(ownerId, "projects", projectId))
  if (!stored || stored.ownerId !== ownerKey(ownerId)) return null
  state.projects.set(projectId, stored)
  return stored
}

/** Changes a project in place, one change at a time. */
export async function updateProject(ownerId: string, projectId: string, change: (project: OsProject) => void, now = Date.now()) {
  const project = await getProject(ownerId, projectId)
  if (!project) return null
  change(project)
  project.updatedAt = now
  project.decisions = project.decisions.slice(-80)
  project.sources = dedupeSources(project.sources).slice(-60)
  project.artifactIds = [...new Set(project.artifactIds)].slice(-300)
  project.flowIds = [...new Set(project.flowIds)].slice(-60)
  const state = await ownerState(ownerId)
  state.index.projects = [projectEntry(project), ...state.index.projects.filter((entry) => entry.id !== project.id)]
  await Promise.all([persist(key(ownerId, "projects", project.id), project), persistIndex(ownerId, state)])
  return project
}

export async function listProjects(ownerId: string) {
  return (await ownerState(ownerId)).index.projects
}

function projectEntry(project: OsProject): ProjectIndexEntry {
  return {
    id: project.id,
    title: project.title,
    goal: project.goal.slice(0, 240),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    artifactCount: project.artifactIds.length,
    chatId: project.chatId,
  }
}

function dedupeSources<T extends { url: string }>(sources: T[]) {
  const seen = new Set<string>()
  return sources.filter((source) => {
    if (seen.has(source.url)) return false
    seen.add(source.url)
    return true
  })
}

/* ------------------------------------------------------------------ flows */

export async function findFlowByRequest(ownerId: string, clientRequestId: string) {
  const state = await ownerState(ownerId)
  const entry = state.index.flows.find((flow) => flow.clientRequestId === clientRequestId)
  return entry ? getFlow(ownerId, entry.id) : null
}

export async function getFlow(ownerId: string, flowId: string): Promise<OsFlow | null> {
  if (!isOsId(flowId)) return null
  const state = await ownerState(ownerId)
  const cached = state.flows.get(flowId)
  if (cached) return cached
  const stored = await (await backend()).read<OsFlow>(key(ownerId, "flows", flowId))
  if (!stored || stored.ownerId !== ownerKey(ownerId)) return null
  state.flows.set(flowId, stored)
  return stored
}

export async function saveFlow(ownerId: string, flow: OsFlow) {
  const state = await ownerState(ownerId)
  state.flows.set(flow.id, flow)
  const entry: FlowIndexEntry = {
    id: flow.id,
    projectId: flow.projectId,
    goal: flow.goal.slice(0, 240),
    status: flow.status,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    clientRequestId: flow.clientRequestId,
    chatId: flow.chatId,
    taskCount: flow.tasks.length,
    artifactCount: flow.tasks.reduce((total, task) => total + task.artifactIds.length, 0),
  }
  state.index.flows = [entry, ...state.index.flows.filter((item) => item.id !== flow.id)]
  await Promise.all([persist(key(ownerId, "flows", flow.id), flow), persistIndex(ownerId, state)])
}

export async function listFlows(ownerId: string, filter: { projectId?: string; limit?: number } = {}) {
  const flows = (await ownerState(ownerId)).index.flows
  return flows.filter((flow) => !filter.projectId || flow.projectId === filter.projectId).slice(0, filter.limit || 50)
}

/* ------------------------------------------------------------ small notes */

const NOTE = /^[a-z0-9-]{3,80}$/

/** A small owner-scoped JSON note (the demo cache, preferences). */
export async function readOwnerJson<T>(ownerId: string, name: string): Promise<T | null> {
  if (!NOTE.test(name)) return null
  return (await backend()).read<T>(`${root(ownerId)}/notes/${name}.json`)
}

export async function writeOwnerJson(ownerId: string, name: string, value: unknown) {
  if (!NOTE.test(name)) throw new Error("INVALID_OS_NOTE")
  await persist(`${root(ownerId)}/notes/${name}.json`, value)
}

/* -------------------------------------------------------------- artifacts */

export type ArtifactDraft = Omit<Artifact, "id" | "ownerId" | "createdAt" | "links" | "metadata"> & {
  links?: ArtifactLink[]
  metadata?: Record<string, unknown>
  createdAt?: number
}

export async function putArtifact(ownerId: string, draft: ArtifactDraft, now = Date.now()): Promise<Artifact> {
  if (draft.content && draft.content.length > MAX_INLINE_ARTIFACT_CHARS) throw new Error("ARTIFACT_TOO_LARGE")
  if (draft.url && /^data:/i.test(draft.url)) throw new Error("ARTIFACT_URL_MUST_NOT_BE_DATA")
  const artifact: Artifact = {
    ...draft,
    id: newId("art"),
    ownerId: ownerKey(ownerId),
    createdAt: draft.createdAt || now,
    title: clean(draft.title, 160) || "Результат",
    links: (draft.links || []).filter((link) => isOsId(link.artifactId)).slice(0, 40),
    metadata: draft.metadata || {},
  }
  const state = await ownerState(ownerId)
  state.artifacts.set(artifact.id, artifact)
  state.index.artifacts.unshift(artifactEntry(artifact))
  await Promise.all([persist(key(ownerId, "artifacts", artifact.id), artifact), persistIndex(ownerId, state)])
  trimArtifactCache(state)
  return artifact
}

export async function getArtifact(ownerId: string, artifactId: string): Promise<Artifact | null> {
  if (!isOsId(artifactId)) return null
  const state = await ownerState(ownerId)
  const cached = state.artifacts.get(artifactId)
  if (cached) return cached
  const stored = await (await backend()).read<Artifact>(key(ownerId, "artifacts", artifactId))
  if (!stored || stored.ownerId !== ownerKey(ownerId)) return null
  state.artifacts.set(artifactId, stored)
  trimArtifactCache(state)
  return stored
}

export async function getArtifacts(ownerId: string, ids: string[]) {
  const found = await Promise.all(ids.map((id) => getArtifact(ownerId, id)))
  return found.filter((artifact): artifact is Artifact => Boolean(artifact))
}

export async function updateArtifactMetadata(ownerId: string, artifactId: string, patch: Partial<Pick<Artifact, "validation" | "summary" | "metadata">>) {
  const artifact = await getArtifact(ownerId, artifactId)
  if (!artifact) return null
  Object.assign(artifact, patch)
  const state = await ownerState(ownerId)
  state.index.artifacts = state.index.artifacts.map((entry) => (entry.id === artifactId ? artifactEntry(artifact) : entry))
  await Promise.all([persist(key(ownerId, "artifacts", artifact.id), artifact), persistIndex(ownerId, state)])
  return artifact
}

export async function artifactIndex(ownerId: string) {
  return (await ownerState(ownerId)).index.artifacts
}

export function artifactEntry(artifact: Artifact): ArtifactIndexEntry {
  const summary = summarizeArtifact(artifact)
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    kind: artifact.kind,
    title: artifact.title,
    createdAt: artifact.createdAt,
    sourceTool: artifact.sourceTool,
    url: artifact.url,
    fallback: artifact.fallback,
    version: artifact.version,
    summary: clean(artifact.summary || firstText(artifact.content), 320),
    links: artifact.links,
    keywords: keywordsOf(artifact),
    bytes: summary.bytes,
    score: artifact.validation?.score,
  }
}

export function toSummary(artifact: Artifact): ArtifactSummary {
  return summarizeArtifact(artifact)
}

function trimArtifactCache(state: OwnerState) {
  // Content stays in storage; memory holds only the recent ones.
  const max = 60
  if (state.artifacts.size <= max) return
  const oldest = [...state.artifacts.values()].sort((a, b) => a.createdAt - b.createdAt)
  for (const artifact of oldest.slice(0, state.artifacts.size - max)) state.artifacts.delete(artifact.id)
}

function firstText(content?: string) {
  if (!content) return ""
  if (/^\s*</.test(content)) {
    const title = content.match(/<title>([^<]{1,200})<\/title>/i)?.[1]
    const heading = content.match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "")
    return [title, heading].filter(Boolean).join(" — ")
  }
  if (/^\s*[{[]/.test(content)) return ""
  return content.replace(/[#*_`>|-]+/g, " ").replace(/\s+/g, " ").trim()
}

function keywordsOf(artifact: Artifact) {
  const text = [artifact.title, artifact.summary, firstText(artifact.content).slice(0, 600), kindWords[artifact.kind]].join(" ")
  return clean(text.toLowerCase(), 900)
}

const kindWords: Record<ArtifactKind, string> = {
  text: "текст text",
  code: "код code проект project",
  image: "изображение картинка image picture логотип",
  video: "видео video",
  audio: "аудио audio музыка голос",
  website: "сайт website лендинг landing",
  presentation: "презентация deck слайды pitch",
  document: "документ document",
  dataset: "данные dataset таблица",
  analysis: "анализ исследование research analysis рынок",
  "business-plan": "бизнес-план business plan финансы",
}

function clean(value: unknown, max: number) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\s+/g, " ").trim().slice(0, max)
}

function isOsIdLoose(value: string) {
  return /^[\w:.-]{1,120}$/.test(value)
}
