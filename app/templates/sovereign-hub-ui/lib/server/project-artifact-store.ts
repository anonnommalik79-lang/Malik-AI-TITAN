import { createHash } from "node:crypto"

import type { ProjectBuilderResult } from "@/lib/ai/project-builder"
import { projectPassport } from "@/lib/proof/project"
import { readPassport } from "@/lib/proof/passport"
import { deletePrivateJson, privateJsonStoreConfigured, readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"

export type StoredProjectArtifact = {
  id: string
  ownerId: string
  filename: string
  project: ProjectBuilderResult
  createdAt: number
  expiresAt: number
  /** Content binding, not a signature or proof that generated code ran. */
  integrity?: { version: 1; sha256: string }
}

const ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ARTIFACTS = 48
const MAX_CACHE_BYTES = 16 * 1024 * 1024
const MAX_SOURCE_BYTES = 4 * 1024 * 1024
const MAX_RECORD_BYTES = 6 * 1024 * 1024
const ARTIFACT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
type CacheEntry = { artifact: StoredProjectArtifact; bytes: number }

const globalArtifacts = globalThis as typeof globalThis & {
  __malikProjectArtifactCache?: Map<string, CacheEntry>
}

function store() {
  if (!globalArtifacts.__malikProjectArtifactCache) {
    globalArtifacts.__malikProjectArtifactCache = new Map<string, CacheEntry>()
  }
  return globalArtifacts.__malikProjectArtifactCache
}

function snapshot<T>(value: T): T {
  const json = JSON.stringify(value)
  if (Buffer.byteLength(json) > MAX_RECORD_BYTES) throw new Error("PROJECT_ARTIFACT_TOO_LARGE")
  return JSON.parse(json) as T
}

/** Refuse ambiguous extraction paths instead of silently losing/renaming files. */
function validateFiles(files: ProjectBuilderResult["files"]) {
  if (!Array.isArray(files) || !files.length || files.length > 200) throw new Error("INVALID_PROJECT_ARTIFACT_FILES")
  const seen = new Set<string>()
  let bytes = 0
  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") throw new Error("INVALID_PROJECT_ARTIFACT_FILES")
    const parts = file.path.split("/")
    if (file.path.length > 240 || parts.some(part => !part || part === "." || part === ".."
      || /[\\<>:"|?*]/u.test(part) || [...part].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /[. ]$/u.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("INVALID_PROJECT_ARTIFACT_PATH")
    const canonical = file.path.normalize("NFC").toLowerCase()
    if (seen.has(canonical)) throw new Error("DUPLICATE_PROJECT_ARTIFACT_PATH")
    seen.add(canonical)
    bytes += Buffer.byteLength(file.content)
    if (bytes > MAX_SOURCE_BYTES) throw new Error("PROJECT_ARTIFACT_TOO_LARGE")
  }
}

function recordChecksum(artifact: StoredProjectArtifact) {
  const payload = { ...artifact }
  delete payload.integrity
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

function cacheArtifact(artifact: StoredProjectArtifact) {
  const artifacts = store()
  artifacts.delete(artifact.id)
  // Bound a conservative text payload estimate, not total process RSS.
  const bytes = Buffer.byteLength(JSON.stringify(artifact)) * 2
  if (bytes <= MAX_CACHE_BYTES) artifacts.set(artifact.id, { artifact, bytes })
  cleanup()
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
  return `private/system/malik-project-artifacts/${ownerHash(ownerId)}/${id}.json`
}

function cleanup(now = Date.now()) {
  const artifacts = store()
  for (const [id, entry] of artifacts) {
    if (entry.artifact.expiresAt <= now) artifacts.delete(id)
  }
  let bytes = [...artifacts.values()].reduce((sum, entry) => sum + entry.bytes, 0)
  for (const [id, entry] of artifacts) {
    if (artifacts.size <= MAX_ARTIFACTS && bytes <= MAX_CACHE_BYTES) break
    artifacts.delete(id)
    bytes -= entry.bytes
  }
}

export async function putProjectArtifact(project: ProjectBuilderResult, ownerId: string) {
  if (project.status !== "completed" || !project.qa?.passed || !project.files.length) {
    throw new Error("Only completed QA-passed projects can be stored as downloadable artifacts.")
  }
  validateFiles(project.files)

  const normalizedOwner = String(ownerId || "guest").trim().toLowerCase() || "guest"
  cleanup()
  const now = Date.now()
  const artifact: StoredProjectArtifact = {
    id: crypto.randomUUID(),
    ownerId: normalizedOwner,
    filename: `${slugify(project.title)}.zip`,
    project: snapshot({ ...project, passport: exportPassport(project, new Date(now)) }),
    createdAt: now,
    expiresAt: now + ARTIFACT_TTL_MS,
  }
  artifact.integrity = { version: 1, sha256: recordChecksum(artifact) }
  snapshot(artifact) // Check the complete envelope before I/O or cache insertion.
  const saved = await writePrivateJson(artifactKey(normalizedOwner, artifact.id), artifact)
  if (!saved && privateJsonStoreConfigured()) throw new Error("PROJECT_ARTIFACT_STORAGE_UNAVAILABLE")
  // Preserve the existing short-lived fallback only without durable storage.
  cacheArtifact(artifact)
  return snapshot(artifact)
}

/** Always regenerated from server-owned QA; model-authored passports are removed. */
export function projectArtifactFiles(project: ProjectBuilderResult, exportedAt?: Date) {
  validateFiles(project.files)
  const passport = exportPassport(project, exportedAt)
  passport.artifacts = project.files.filter(file => file.path.toUpperCase() !== "PROOF_PASSPORT.JSON").slice(0, 20).map(file => ({
    name: file.path, bytes: Buffer.byteLength(file.content), sha256: createHash("sha256").update(file.content).digest("hex"),
  }))
  return [
    ...project.files.filter(file => file.path.toUpperCase() !== "PROOF_PASSPORT.JSON").map(file => ({ name: file.path, content: file.content })),
    { name: "PROOF_PASSPORT.json", content: JSON.stringify(passport, null, 2) },
  ]
}

function exportPassport(project: ProjectBuilderResult, now?: Date) {
  const stored = readPassport(project.passport)
  if (stored?.kind === "selfbuild") {
    const content = project.files.map(file => ({path:file.path,content:file.content})).sort((a,b)=>a.path.localeCompare(b.path))
    const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex")
    if (stored.sourceHash === hash && stored.projectId === project.projectId) return stored
    // Stale receipts must never bless edited code.
  }
  return projectPassport({ ...project, now })
}

export async function getProjectArtifact(id: string, ownerId: string) {
  if (typeof id !== "string" || !ARTIFACT_ID.test(id)) return null
  cleanup()
  const normalizedOwner = String(ownerId || "guest").trim().toLowerCase() || "guest"
  let artifact = store().get(id)?.artifact || null

  if (artifact && artifact.ownerId !== normalizedOwner) return null

  if (!artifact) {
    artifact = await readPrivateJson<StoredProjectArtifact>(artifactKey(normalizedOwner, id), { throwOnReadError: true })
    if (artifact?.ownerId !== normalizedOwner) return null
  }

  if (!artifact || artifact.expiresAt <= Date.now()) {
    if (artifact && artifact.id === id) {
      store().delete(id)
      await deletePrivateJson(artifactKey(normalizedOwner, id))
    }
    return null
  }
  try {
    if (artifact.id !== id || !Number.isFinite(artifact.createdAt) || !Number.isFinite(artifact.expiresAt)
      || artifact.expiresAt <= artifact.createdAt || typeof artifact.filename !== "string"
      || typeof artifact.project?.title !== "string" || typeof artifact.project.projectId !== "string"
      || artifact.project.status !== "completed" || !artifact.project.qa?.passed
      || !Array.isArray(artifact.project.qa.checks) || !Array.isArray(artifact.project.qa.issues)) return null
    validateFiles(artifact.project.files)
    // Legacy records remain readable after structural validation. New records
    // additionally bind their envelope and every file to the saved checksum.
    if (artifact.integrity && (artifact.integrity.version !== 1 || artifact.integrity.sha256 !== recordChecksum(artifact))) return null
    const result = snapshot(artifact)
    cacheArtifact(artifact)
    return result
  } catch {
    store().delete(id)
    return null
  }
}
