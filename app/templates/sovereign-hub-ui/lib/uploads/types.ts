export type UploadedFileKind = "image" | "video" | "audio" | "document" | "text" | "unknown"

export type UploadedFile = {
  id: string
  name: string
  mime: string
  size: number
  kind: UploadedFileKind
  base64?: string
  text?: string
  url?: string
  storagePath?: string
}

export type UploadValidationResult =
  | { ok: true; file: UploadedFile }
  | { ok: false; error: string; code: string }
