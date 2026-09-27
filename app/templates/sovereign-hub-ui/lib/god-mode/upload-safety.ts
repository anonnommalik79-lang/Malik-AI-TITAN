import "server-only"

const SAFE_NAME = /[^a-zA-Z0-9._() -]+/g

export type UploadKind = "image" | "video" | "audio" | "document" | "dataset"

const POLICY: Record<UploadKind, { maxBytes: number; mimes: Set<string> }> = {
  image: {
    maxBytes: 16 * 1024 * 1024,
    mimes: new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]),
  },
  video: {
    maxBytes: 64 * 1024 * 1024,
    mimes: new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]),
  },
  audio: {
    maxBytes: 32 * 1024 * 1024,
    mimes: new Set(["audio/mpeg", "audio/wav", "audio/webm", "audio/ogg", "audio/mp4"]),
  },
  document: {
    maxBytes: 32 * 1024 * 1024,
    mimes: new Set([
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/json",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]),
  },
  dataset: {
    maxBytes: 32 * 1024 * 1024,
    mimes: new Set([
      "text/csv",
      "application/csv",
      "application/json",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
  },
}

function starts(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function plausibleSignature(mime: string, bytes: Uint8Array) {
  if (!bytes.length) return false
  if (mime === "image/png") return starts(bytes, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])
  if (mime === "image/jpeg") return starts(bytes, [0xff,0xd8,0xff])
  if (mime === "image/webp") return bytes.length >= 12 && starts(bytes, [0x52,0x49,0x46,0x46]) && String.fromCharCode(...bytes.slice(8,12)) === "WEBP"
  if (mime === "application/pdf") return starts(bytes, [0x25,0x50,0x44,0x46])
  if (mime.includes("openxmlformats") || mime === "application/vnd.ms-excel") return starts(bytes, [0x50,0x4b])
  if (mime === "video/mp4" || mime === "video/quicktime" || mime === "video/x-m4v" || mime === "audio/mp4") {
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4,8)) === "ftyp"
  }
  if (mime === "audio/mpeg") return starts(bytes, [0x49,0x44,0x33]) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  // Formats without a reliable tiny signature are still bounded by an allowlist,
  // declared type and size. Providers must validate/decode them before use.
  return true
}

export function safeUploadName(value: string) {
  const name = String(value || "upload").replace(/[\\/]/g, "_").replace(SAFE_NAME, "_").replace(/\.{2,}/g, ".").trim()
  return (name || "upload").slice(0, 160)
}

export function uploadPolicy(kind: UploadKind) {
  return POLICY[kind]
}

export async function validateUpload(file: File, kind: UploadKind) {
  const policy = POLICY[kind]
  const mime = String(file.type || "").toLowerCase().split(";")[0].trim()
  if (!file.size) return { ok: false as const, code: "EMPTY_FILE", error: "Файл пуст." }
  if (file.size > policy.maxBytes) return { ok: false as const, code: "FILE_TOO_LARGE", error: `Файл больше разрешённого лимита ${Math.floor(policy.maxBytes / 1024 / 1024)} МБ.` }
  if (!policy.mimes.has(mime)) return { ok: false as const, code: "UNSUPPORTED_FILE_TYPE", error: "Этот тип файла не поддерживается." }

  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  if (!plausibleSignature(mime, head)) return { ok: false as const, code: "FILE_SIGNATURE_MISMATCH", error: "Содержимое файла не соответствует его типу." }

  return {
    ok: true as const,
    name: safeUploadName(file.name),
    mime,
    bytes: file.size,
    maxBytes: policy.maxBytes,
  }
}
