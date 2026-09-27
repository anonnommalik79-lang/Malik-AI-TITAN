import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { deletePrivateJson, readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"
import { getGodProject } from "./project-state"

type ShareRecord = {
  version: 1
  id: string
  projectId: string
  ownerId: string
  secretHash: string
  createdAt: string
  expiresAt: string
  revokedAt?: string
}

function shareId(value: string) {
  const id = String(value || "").trim()
  return /^[a-zA-Z0-9_-]{12,80}$/.test(id) ? id : ""
}

function key(id: string) {
  return `private/system/malik-god-shares/${id}.json`
}

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex")
}

function equalHash(left: string, right: string) {
  try {
    const a = Buffer.from(left, "hex")
    const b = Buffer.from(right, "hex")
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function createProjectShare(ownerId: string, projectId: string, ttlHours = 24) {
  const project = await getGodProject(projectId, ownerId)
  if (!project) return null
  const id = randomBytes(12).toString("base64url")
  const secret = randomBytes(24).toString("base64url")
  const now = Date.now()
  const record: ShareRecord = {
    version: 1,
    id,
    projectId: project.id,
    ownerId: project.ownerId,
    secretHash: hashSecret(secret),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + Math.max(1, Math.min(168, ttlHours)) * 60 * 60 * 1000).toISOString(),
  }
  const stored = await writePrivateJson(key(id), record)
  if (!stored) return null
  return {
    id,
    token: `${id}.${secret}`,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  }
}

async function recordForToken(token: string) {
  const [rawId, secret, ...rest] = String(token || "").split(".")
  if (rest.length || !shareId(rawId) || !/^[a-zA-Z0-9_-]{24,80}$/.test(secret || "")) return null
  const record = await readPrivateJson<ShareRecord>(key(rawId))
  if (!record || record.version !== 1 || record.id !== rawId || record.revokedAt) return null
  if (Date.parse(record.expiresAt) <= Date.now()) return null
  if (!equalHash(record.secretHash, hashSecret(secret))) return null
  return record
}

function publicProject(project: NonNullable<Awaited<ReturnType<typeof getGodProject>>>) {
  return {
    id: project.id,
    title: project.title,
    goal: project.goal,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    tasks: Object.values(project.tasks).map((task) => ({
      id: task.id,
      type: task.type,
      label: task.label,
      status: task.status,
      progress: task.progress,
      stage: task.stage,
      dependencies: task.dependencies,
      artifactIds: task.artifactIds,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
    })),
    artifacts: Object.values(project.artifacts).map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      version: artifact.version,
      parentArtifactId: artifact.parentArtifactId,
      derivedFrom: artifact.derivedFrom,
      createdAt: artifact.createdAt,
      approved: artifact.approved,
      // Provider/CDN URLs and raw metadata are deliberately private. A public
      // share is a project overview, not a media-token exfiltration endpoint.
    })),
    pinnedArtifactIds: project.pinnedArtifactIds,
  }
}

export async function resolvePublicProjectShare(token: string) {
  const record = await recordForToken(token)
  if (!record) return null
  const project = await getGodProject(record.projectId, record.ownerId)
  if (!project) return null
  return {
    shareId: record.id,
    expiresAt: record.expiresAt,
    project: publicProject(project),
  }
}

export async function revokeProjectShare(ownerId: string, idValue: string) {
  const id = shareId(idValue)
  if (!id) return false
  const record = await readPrivateJson<ShareRecord>(key(id))
  if (!record || record.ownerId !== String(ownerId || "").trim().toLowerCase()) return false
  // Delete instead of keeping a tombstone: random secret + missing record is
  // sufficient revocation and leaves no public metadata behind.
  return deletePrivateJson(key(id))
}
