import type { ProjectBuilderResult } from "@/lib/ai/project-builder"

export type StoredProjectArtifact = {
  id: string
  filename: string
  project: ProjectBuilderResult
  createdAt: number
  expiresAt: number
}

const ARTIFACT_TTL_MS = 2 * 60 * 60 * 1000
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

export function putProjectArtifact(project: ProjectBuilderResult) {
  if (project.status !== "completed" || !project.qa?.passed || !project.files.length) {
    throw new Error("Only completed QA-passed projects can be stored as downloadable artifacts.")
  }

  cleanup()
  const now = Date.now()
  const artifact: StoredProjectArtifact = {
    id: crypto.randomUUID(),
    filename: `${slugify(project.title)}.zip`,
    project,
    createdAt: now,
    expiresAt: now + ARTIFACT_TTL_MS,
  }
  store().set(artifact.id, artifact)
  cleanup(now)
  return artifact
}

export function getProjectArtifact(id: string) {
  cleanup()
  const artifact = store().get(String(id || ""))
  if (!artifact || artifact.expiresAt <= Date.now()) {
    if (artifact) store().delete(artifact.id)
    return null
  }
  return artifact
}
