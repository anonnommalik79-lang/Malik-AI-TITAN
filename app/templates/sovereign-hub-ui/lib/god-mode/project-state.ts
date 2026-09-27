import "server-only"

import { createHash, randomUUID } from "node:crypto"

import { deletePrivateJson, readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"
import type { GodArtifact, GodArtifactKind, GodProject, GodTask, GodTaskStatus } from "./contracts"
import { pushGodNotification } from "./notifications"

type ProjectGlobal = typeof globalThis & {
  __malikGodProjects?: Map<string, GodProject>
}

const MAX_ACTIVITY = 400
const MAX_PROJECT_INDEX = 80

type ProjectSummary = Pick<GodProject, "id" | "title" | "goal" | "status" | "createdAt" | "updatedAt">
type IndexGlobal = typeof globalThis & { __malikGodProjectIndex?: Map<string, ProjectSummary[]> }

function indexMemory() {
  const scope = globalThis as IndexGlobal
  if (!scope.__malikGodProjectIndex) scope.__malikGodProjectIndex = new Map()
  return scope.__malikGodProjectIndex
}

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

function projectIndexKey(ownerId: string) {
  return `private/system/malik-god-projects/${ownerHash(ownerId)}/index.json`
}

function summary(project: GodProject): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    goal: project.goal,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

async function readIndex(ownerId: string) {
  const owner = normalizedOwner(ownerId)
  const cached = indexMemory().get(owner)
  if (cached) return structuredClone(cached)
  const stored = await readPrivateJson<ProjectSummary[]>(projectIndexKey(owner))
  const safe = Array.isArray(stored)
    ? stored.filter((item) => item && validProjectId(item.id)).slice(0, MAX_PROJECT_INDEX)
    : []
  indexMemory().set(owner, safe)
  return structuredClone(safe)
}

async function writeIndex(ownerId: string, projects: ProjectSummary[]) {
  const owner = normalizedOwner(ownerId)
  const safe = projects
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_PROJECT_INDEX)
  indexMemory().set(owner, structuredClone(safe))
  await writePrivateJson(projectIndexKey(owner), safe)
}

function now() {
  return new Date().toISOString()
}

async function persist(project: GodProject) {
  project.updatedAt = now()
  memory().set(project.id, structuredClone(project))
  await writePrivateJson(projectKey(project.ownerId, project.id), project)
  const projects = await readIndex(project.ownerId)
  const next = [summary(project), ...projects.filter((item) => item.id !== project.id)]
  await writeIndex(project.ownerId, next)
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

async function settleProjectIfReady(projectIdValue: string, ownerId: string) {
  let becameReady = false
  const project = await mutateProject(projectIdValue, ownerId, (draft) => {
    const tasks = Object.values(draft.tasks)
    if (!tasks.length || draft.status === "completed") return
    if (tasks.every((task) => task.status === "completed")) {
      draft.status = "completed"
      draft.activity.push({
        id: randomUUID(),
        at: now(),
        type: "project.completed",
        message: "PROJECT READY",
      })
      becameReady = true
      return
    }
    if (tasks.some((task) => task.status === "failed") && tasks.every((task) => ["completed", "failed", "cancelled"].includes(task.status))) {
      draft.status = "failed"
    }
  })
  if (becameReady && project) {
    await pushGodNotification(ownerId, {
      type: "project-ready",
      title: project.title,
      message: "PROJECT READY — все задачи проекта завершены.",
      projectId: project.id,
    }).catch(() => undefined)
  }
  return project
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
  if (project && result && ["completed", "failed", "cancelled"].includes(result.status)) {
    const type = result.status === "completed"
      ? "task-completed"
      : result.status === "failed"
        ? "task-failed"
        : "task-cancelled"
    await pushGodNotification(ownerId, {
      type,
      title: result.label,
      message: result.status === "completed"
        ? "Задача завершена."
        : result.status === "failed"
          ? (result.errorMessage || "Задача завершилась ошибкой.")
          : "Задача отменена.",
      projectId: project.id,
      taskId: result.id,
    }).catch(() => undefined)
    await settleProjectIfReady(project.id, ownerId)
  }
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


export async function listGodProjects(ownerId: string) {
  return readIndex(ownerId)
}

function searchableProjectText(project: GodProject) {
  return [
    project.title,
    project.goal,
    ...Object.values(project.tasks).flatMap((task) => [task.label, task.type, task.stage || ""]),
    ...Object.values(project.artifacts).flatMap((artifact) => [artifact.title, artifact.kind, artifact.sourceTool || ""]),
  ].join("\n").toLowerCase()
}

export async function searchGodProjects(ownerId: string, query: string, limit = 20) {
  const normalized = String(query || "").trim().toLowerCase()
  if (!normalized) return []
  const terms = normalized.split(/\s+/).filter(Boolean).slice(0, 12)
  const index = await readIndex(ownerId)
  const results: Array<{ project: GodProject; score: number }> = []

  for (const item of index.slice(0, 40)) {
    const project = await getGodProject(item.id, ownerId)
    if (!project) continue
    const text = searchableProjectText(project)
    const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0)
    if (score) results.push({ project, score })
  }

  return results
    .sort((a, b) => b.score - a.score || Date.parse(b.project.updatedAt) - Date.parse(a.project.updatedAt))
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map(({ project, score }) => ({ score, manifest: projectManifest(project) }))
}

export async function rollbackGodArtifact(projectIdValue: string, ownerId: string, artifactId: string) {
  let rolledBackTo: GodArtifact | null = null
  const project = await mutateProject(projectIdValue, ownerId, (draft) => {
    const current = draft.artifacts[artifactId]
    if (!current?.parentArtifactId) return
    const parent = draft.artifacts[current.parentArtifactId]
    if (!parent) return
    current.approved = false
    parent.approved = true
    draft.pinnedArtifactIds = [parent.id, ...draft.pinnedArtifactIds.filter((id) => id !== parent.id && id !== current.id)].slice(0, 32)
    draft.activity.push({
      id: randomUUID(),
      at: now(),
      type: "artifact.rollback",
      message: `Rolled back ${current.title} to v${parent.version}`,
      artifactId: parent.id,
      metadata: { fromArtifactId: current.id },
    })
    rolledBackTo = structuredClone(parent)
  })
  return project ? rolledBackTo : null
}

export async function deleteGodProject(projectIdValue: string, ownerId: string) {
  const id = validProjectId(projectIdValue)
  const owner = normalizedOwner(ownerId)
  if (!id) return false
  const project = await getGodProject(id, owner)
  if (!project) return false
  memory().delete(id)
  const index = await readIndex(owner)
  await writeIndex(owner, index.filter((item) => item.id !== id))
  await deletePrivateJson(projectKey(owner, id))
  return true
}


export async function listActiveGodTasks(ownerId: string, limit = 50) {
  const index = await readIndex(ownerId)
  const active: Array<{ projectId: string; projectTitle: string; task: GodTask }> = []
  for (const item of index.slice(0, 40)) {
    const project = await getGodProject(item.id, ownerId)
    if (!project) continue
    for (const task of Object.values(project.tasks)) {
      if (!["queued", "running", "waiting", "retrying"].includes(task.status)) continue
      active.push({ projectId: project.id, projectTitle: project.title, task })
    }
  }
  return active
    .sort((a, b) => Date.parse(b.task.updatedAt) - Date.parse(a.task.updatedAt))
    .slice(0, Math.max(1, Math.min(100, limit)))
}

export async function compareGodArtifacts(
  projectIdValue: string,
  ownerId: string,
  leftId: string,
  rightId: string,
) {
  const project = await getGodProject(projectIdValue, ownerId)
  const left = project?.artifacts[leftId]
  const right = project?.artifacts[rightId]
  if (!project || !left || !right) return null

  const metadataKeys = [...new Set([...Object.keys(left.metadata || {}), ...Object.keys(right.metadata || {})])].sort()
  const metadataDiff = metadataKeys.flatMap((key) => {
    const before = left.metadata?.[key]
    const after = right.metadata?.[key]
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ key, before, after }]
  })

  return {
    projectId: project.id,
    left: {
      id: left.id,
      kind: left.kind,
      title: left.title,
      version: left.version,
      parentArtifactId: left.parentArtifactId,
      createdAt: left.createdAt,
      url: left.url,
    },
    right: {
      id: right.id,
      kind: right.kind,
      title: right.title,
      version: right.version,
      parentArtifactId: right.parentArtifactId,
      createdAt: right.createdAt,
      url: right.url,
    },
    sameKind: left.kind === right.kind,
    sameLineage: left.id === right.parentArtifactId
      || right.id === left.parentArtifactId
      || Boolean(left.derivedFrom.includes(right.id) || right.derivedFrom.includes(left.id)),
    titleChanged: left.title !== right.title,
    urlChanged: left.url !== right.url,
    metadataDiff,
  }
}
