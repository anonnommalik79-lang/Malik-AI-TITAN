import { uploadMediaAsset, isCloudStorageConfigured } from "@/lib/storage/cloud-upload"
import type { UploadedFile } from "./types"

export function isStorageConfigured(): boolean {
  return isCloudStorageConfigured()
}

export function isSupabaseStorageConfigured(): boolean {
  return isCloudStorageConfigured()
}

export async function persistUploadMetadata(userId: string, file: UploadedFile) {
  if (!isStorageConfigured()) {
    return { stored: false, reason: "Storage is not configured. File kept as client preview only.", file }
  }

  if (!file.base64) {
    return { stored: false, reason: "No base64 payload to upload.", file }
  }

  const uploaded = await uploadMediaAsset({
    userId,
    fileName: file.name,
    mime: file.mime,
    base64: file.base64,
    kind: file.kind,
  })

  if (!uploaded.stored) {
    return { stored: false, reason: uploaded.reason, file }
  }

  return {
    stored: true,
    publicUrl: uploaded.publicUrl,
    path: uploaded.path,
    bucket: uploaded.bucket,
    file: { ...file, url: uploaded.publicUrl || file.url },
  }
}
