import { createHash } from "node:crypto"

import type { ProjectBuilderResult } from "@/lib/ai/project-builder"
import { deletePrivateJson, readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"

export type StoredProjectArtifact = {
  id: string
  ownerId: string
  filename: string
  project: ProjectBuilderResult
  createdAt: number
  expiresAt: number
}

const ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ARTIFACTS = 48

const globalArtifacts = globalThis as typeof globalThis & {
  __malikProjectArtifacts?: Map<string, StoredProjectArtifact>
}

function store() {
  if (!globalArtifacts.__malikProjectArtifacts) {
    globalArtifacts.__malikProjectArtifacts = new Map<string, StoredProjectArtifact>()
  }
  return globalArtifacts.__malikProjectArtifacts
}

function slugify(value: string) {
  return String(value || "malik-project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "malik-project"
}

function ownerHash(ownerId: string) {
  return createHash("sha256").update(String(ownerId || "guest").trim().toLowerCase()).digest("hex")
}

function artifactKey(ownerId: string, id: string) {
  return `private/system/malik-project-artifacts/${ownerHash(ownerId)}/${String(id || "").replace(/[^a-f0-9-]/gi, "")}.json`
}

function cleanup(now = Date.now()) {
  const artifacts = store()
  for (const [id, artifact] of artifacts) {
    if (artifact.expiresAt <= now) artifacts.delete(id)
  }

  if (artifacts.size <= MAX_ARTIFACTS) return
  const oldest = [...artifacts.values()].sort((a, b) => a.createdAt - b.createdAt)
  for (const artifact of oldest.slice(0, artifacts.size - MAX_ARTIFACTS)) {
    artifacts.delete(artifact.id)
  }
}

export async function putProjectArtifact(project: ProjectBuilderResult, ownerId: string) {
  if (project.status !== "completed" || !project.qa?.passed || !project.files.length) {
    throw new Error("Only completed QA-passed projects can be stored as downloadable artifacts.")
  }

  const normalizedOwner = String(ownerId || "guest").trim().toLowerCase() || "guest"
  cleanup()
  const now = Date.now()
  const artifact: StoredProjectArtifact = {
    id: crypto.randomUUID(),
    ownerId: normalizedOwner,
    filename: `${slugify(project.title)}.zip`,
    project,
    createdAt: now,
    expiresAt: now + ARTIFACT_TTL_MS,
  }
  store().set(artifact.id, artifact)
  cleanup(now)
  await writePrivateJson(artifactKey(normalizedOwner, artifact.id), artifact)
  return artifact
}

export async function getProjectArtifact(id: string, ownerId: string) {
  cleanup()
  const normalizedOwner = String(ownerId || "guest").trim().toLowerCase() || "guest"
  let artifact = store().get(String(id || "")) || null

  if (artifact && artifact.ownerId !== normalizedOwner) return null

  if (!artifact) {
    artifact = await readPrivateJson<StoredProjectArtifact>(artifactKey(normalizedOwner, id))
    if (artifact?.ownerId !== normalizedOwner) return null
    if (artifact) store().set(artifact.id, artifact)
  }

  if (!artifact || artifact.expiresAt <= Date.now()) {
    if (artifact) {
      store().delete(artifact.id)
      await deletePrivateJson(artifactKey(normalizedOwner, artifact.id))
    }
    return null
  }
  return artifact
}
