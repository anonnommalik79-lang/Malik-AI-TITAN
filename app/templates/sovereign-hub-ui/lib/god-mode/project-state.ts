import "server-only"

import { createHash, randomUUID } from "node:crypto"

import { readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"
import type { GodArtifact, GodArtifactKind, GodProject, GodTask, GodTaskStatus } from "./contracts"

type ProjectGlobal = typeof globalThis & {
  __malikGodProjects?: Map<string, GodProject>
}

const MAX_ACTIVITY = 400

function memory() {
  const scope = globalThis as ProjectGlobal
  if (!scope.__malikGodProjects) scope.__malikGodProjects = new Map()
  return scope.__malikGodProjects
}

function normalizedOwner(ownerId: string) {
  return String(ownerId || "guest").trim().toLowerCase() || "guest"
}

function ownerHash(ownerId: string) {
  return createHash("sha256").update(normalizedOwner(ownerId)).digest("hex")
}

function validProjectId(value: string) {
  const id = String(value || "").trim()
  return /^[a-f0-9-]{16,64}$/i.test(id) ? id : ""
}

function projectKey(ownerId: string, id: string) {
  return `private/system/malik-god-projects/${ownerHash(ownerId)}/${id}.json`
}

function now() {
  return new Date().toISOString()
}

async function persist(project: GodProject) {
  project.updatedAt = now()
  memory().set(project.id, structuredClone(project))
  await writePrivateJson(projectKey(project.ownerId, project.id), project)
  return structuredClone(project)
}

export async function createGodProject(ownerId: string, input: { title?: string; goal: string }) {
  const createdAt = now()
  const project: GodProject = {
    schemaVersion: 1,
    id: randomUUID(),
    ownerId: normalizedOwner(ownerId),
    title: String(input.title || input.goal || "Malik Project").trim().slice(0, 120) || "Malik Project",
    goal: String(input.goal || "").trim().slice(0, 8_000),
    status: "active",
    createdAt,
    updatedAt: createdAt,
    tasks: Object.create(null),
    artifacts: Object.create(null),
    activity: [],
    pinnedArtifactIds: [],
  }
  project.activity.push({ id: randomUUID(), at: createdAt, type: "project.created", message: "Project created" })
  return persist(project)
}

export async function getGodProject(idValue: string, ownerId: string) {
  const id = validProjectId(idValue)
  if (!id) return null
  const owner = normalizedOwner(ownerId)
  const cached = memory().get(id)
  if (cached) return cached.ownerId === owner ? structuredClone(cached) : null
  const stored = await readPrivateJson<GodProject>(projectKey(owner, id))
  if (!stored || stored.id !== id || stored.ownerId !== owner || stored.schemaVersion !== 1) return null
  memory().set(id, structuredClone(stored))
  return structuredClone(stored)
}

async function mutateProject(id: string, ownerId: string, change: (project: GodProject) => void) {
  const project = await getGodProject(id, ownerId)
  if (!project) return null
  change(project)
  project.activity = project.activity.slice(-MAX_ACTIVITY)
  return persist(project)
}

function allowedTransition(from: GodTaskStatus, to: GodTaskStatus) {
  const map: Record<GodTaskStatus, GodTaskStatus[]> = {
    queued: ["running", "cancelled", "failed"],
    running: ["waiting", "retrying", "completed", "failed", "cancelled"],
    waiting: ["running", "retrying", "failed", "cancelled"],
    retrying: ["queued", "running", "failed", "cancelled"],
    completed: [],
    failed: ["retrying"],
    cancelled: ["retrying"],
  }
  return from === to || map[from].includes(to)
}

export async function createGodTask(
  projectIdValue: string,
  ownerId: string,
  input: {
    type: string
    label: string
    dependencies?: string[]
    idempotencyKey?: string
    maxAttempts?: number
    provider?: string
  },
) {
  let result: GodTask | null = null
  const project = await mutateProject(projectIdValue, ownerId, (draft) => {
    const key = String(input.idempotencyKey || "").trim().slice(0, 180)
    if (key) {
      const existing = Object.values(draft.tasks).find((task) => task.idempotencyKey === key)
      if (existing) {
        result = structuredClone(existing)
        return
      }
    }
    const timestamp = now()
    const task: GodTask = {
      id: randomUUID(),
      projectId: draft.id,
      type: String(input.type || "task").trim().slice(0, 80) || "task",
      label: String(input.label || "Task").trim().slice(0, 180) || "Task",
      status: "queued",
      dependencies: [...new Set(input.dependencies || [])].filter((id) => Boolean(draft.tasks[id])),
      artifactIds: [],
      attempt: 0,
      maxAttempts: Math.max(1, Math.min(8, Math.floor(input.maxAttempts || 3))),
      idempotencyKey: key || undefined,
      provider: input.provider?.trim().slice(0, 80) || undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    draft.tasks[task.id] = task
    draft.activity.push({ id: randomUUID(), at: timestamp, type: "task.created", message: task.label, taskId: task.id })
    result = structuredClone(task)
  })
  return project ? result : null
}

export async function transitionGodTask(
  projectIdValue: string,
  ownerId: string,
  taskId: string,
  input: {
    status: GodTaskStatus
    progress?: number
    stage?: string
    provider?: string
    errorCode?: string
    errorMessage?: string
    traceId?: string
  },
) {
  let result: GodTask | null = null
  const project = await mutateProject(projectIdValue, ownerId, (draft) => {
    const task = draft.tasks[taskId]
    if (!task) return
    if (!allowedTransition(task.status, input.status)) throw new Error(`INVALID_TASK_TRANSITION:${task.status}->${input.status}`)
    const timestamp = now()
    task.status = input.status
    task.updatedAt = timestamp
    if (typeof input.progress === "number") task.progress = Math.max(0, Math.min(100, Math.round(input.progress)))
    if (input.stage) task.stage = input.stage.slice(0, 160)
    if (input.provider) task.provider = input.provider.slice(0, 80)
    if (input.errorCode) task.errorCode = input.errorCode.slice(0, 80)
    if (input.errorMessage) task.errorMessage = input.errorMessage.slice(0, 500)
    if (input.status === "running" && !task.startedAt) {
      task.startedAt = timestamp
      task.attempt += 1
    }
    if (["completed", "failed", "cancelled"].includes(input.status)) task.finishedAt = timestamp
    draft.activity.push({
      id: randomUUID(),
      at: timestamp,
      type: `task.${input.status}`,
      message: input.stage || task.label,
      taskId: task.id,
      traceId: input.traceId,
    })
    result = structuredClone(task)
  })
  return project ? result : null
}

export async function retryGodTask(projectIdValue: string, ownerId: string, taskId: string, traceId?: string) {
  const project = await getGodProject(projectIdValue, ownerId)
  const task = project?.tasks[taskId]
  if (!project || !task) return null
  if (!["failed", "cancelled"].includes(task.status) || task.attempt >= task.maxAttempts) return null
  await transitionGodTask(project.id, ownerId, taskId, { status: "retrying", stage: "Preparing retry", traceId })
  return transitionGodTask(project.id, ownerId, taskId, { status: "queued", progress: 0, stage: "Queued for retry", traceId })
}

export async function addGodArtifact(
  projectIdValue: string,
  ownerId: string,
  input: {
    kind: GodArtifactKind
    title: string
    sourceTaskId?: string
    sourceTool?: string
    parentArtifactId?: string
    derivedFrom?: string[]
    url?: string
    metadata?: Record<string, unknown>
  },
) {
  let result: GodArtifact | null = null
  const project = await mutateProject(projectIdValue, ownerId, (draft) => {
    const parent = input.parentArtifactId ? draft.artifacts[input.parentArtifactId] : undefined
    const artifact: GodArtifact = {
      id: randomUUID(),
      projectId: draft.id,
      kind: input.kind,
      title: String(input.title || "Artifact").trim().slice(0, 180) || "Artifact",
      sourceTaskId: input.sourceTaskId && draft.tasks[input.sourceTaskId] ? input.sourceTaskId : undefined,
      sourceTool: input.sourceTool?.slice(0, 80),
      version: parent ? parent.version + 1 : 1,
      parentArtifactId: parent?.id,
      derivedFrom: [...new Set([...(input.derivedFrom || []), ...(parent ? [parent.id] : [])])]
        .filter((id) => Boolean(draft.artifacts[id])),
      url: input.url?.slice(0, 4_000),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      createdAt: now(),
    }
    draft.artifacts[artifact.id] = artifact
    if (artifact.sourceTaskId) {
      const task = draft.tasks[artifact.sourceTaskId]
      if (!task.artifactIds.includes(artifact.id)) task.artifactIds.push(artifact.id)
    }
    draft.activity.push({ id: randomUUID(), at: artifact.createdAt, type: "artifact.created", message: artifact.title, taskId: artifact.sourceTaskId, artifactId: artifact.id })
    result = structuredClone(artifact)
  })
  return project ? result : null
}

export async function pinGodArtifact(projectIdValue: string, ownerId: string, artifactId: string) {
  return mutateProject(projectIdValue, ownerId, (draft) => {
    if (!draft.artifacts[artifactId]) return
    draft.pinnedArtifactIds = [artifactId, ...draft.pinnedArtifactIds.filter((id) => id !== artifactId)].slice(0, 32)
    draft.artifacts[artifactId].approved = true
    draft.activity.push({ id: randomUUID(), at: now(), type: "artifact.pinned", message: draft.artifacts[artifactId].title, artifactId })
  })
}

export function projectManifest(project: GodProject) {
  return {
    schemaVersion: project.schemaVersion,
    id: project.id,
    title: project.title,
    goal: project.goal,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    tasks: Object.values(project.tasks),
    artifacts: Object.values(project.artifacts),
    pinnedArtifactIds: project.pinnedArtifactIds,
    activity: project.activity,
  }
}
