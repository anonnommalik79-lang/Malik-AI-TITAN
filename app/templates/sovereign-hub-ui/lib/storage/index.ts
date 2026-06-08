export type StorageKind = "image" | "video" | "project-export" | "upload" | "other"

export type StoredFile = {
  id: string
  kind: StorageKind
  filename: string
  contentType: string
  size: number
  url: string
  createdAt: string
}

const memoryFiles = new Map<string, StoredFile>()

function id() {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function storageStatus() {
  const s3 = Boolean(process.env.S3_BUCKET || process.env.STORAGE_BUCKET)
  const r2 = Boolean(process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET)
  return {
    configured: s3 || r2,
    mode: r2 ? "cloudflare-r2-ready" : s3 ? "s3-ready" : "local-dev",
    message: s3 || r2 ? "Object storage env configured." : "Object storage missing. Using local/dev fallback.",
  }
}

export async function saveGeneratedFile(input: {
  kind: StorageKind
  filename: string
  contentType?: string
  size?: number
  data?: string | Uint8Array
}) {
  const fileId = id()
  const file: StoredFile = {
    id: fileId,
    kind: input.kind,
    filename: input.filename,
    contentType: input.contentType || "application/octet-stream",
    size: input.size || (typeof input.data === "string" ? input.data.length : input.data?.byteLength || 0),
    url: `/api/storage/generated/${fileId}/${encodeURIComponent(input.filename)}`,
    createdAt: new Date().toISOString(),
  }
  memoryFiles.set(fileId, file)
  return file
}

export function getFileUrl(fileId: string) {
  return memoryFiles.get(fileId)?.url || null
}

export async function deleteFile(fileId: string) {
  return memoryFiles.delete(fileId)
}

export async function listStoredFiles(kind?: StorageKind) {
  return [...memoryFiles.values()].filter((file) => !kind || file.kind === kind).slice(-100).reverse()
}

