export function isCloudStorageConfigured() {
  return false
}

export async function uploadMediaAsset(_input: {
  userId: string
  fileName: string
  mime: string
  base64?: string
  buffer?: Buffer
  kind?: string
  sessionId?: string
}) {
  return {
    stored: false,
    reason: "Cloud storage is not configured. Malik AI keeps this asset in the current workspace.",
    publicUrl: "",
    path: "",
    bucket: "",
  }
}
