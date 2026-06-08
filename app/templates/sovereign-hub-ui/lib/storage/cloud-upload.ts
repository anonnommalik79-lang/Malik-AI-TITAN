import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/server/supabase-admin"
import { resolveAuthUserUuid } from "@/lib/server/usage-persistence"

function storageBucket() {
  return (
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.STORAGE_BUCKET?.trim() ||
    process.env.R2_BUCKET?.trim() ||
    process.env.CLOUDFLARE_R2_BUCKET?.trim() ||
    "malik-media"
  )
}

export function isCloudStorageConfigured() {
  return isSupabaseAdminConfigured()
}

function decodeBase64(data: string): Buffer {
  const raw = data.includes(",") ? data.split(",")[1] : data
  return Buffer.from(raw, "base64")
}

export async function uploadMediaAsset(input: {
  userId: string
  fileName: string
  mime: string
  base64?: string
  buffer?: Buffer
  kind?: string
  sessionId?: string
}) {
  if (!isCloudStorageConfigured()) {
    return { stored: false, reason: "Storage not configured. Add Supabase keys + SUPABASE_STORAGE_BUCKET." }
  }

  const uuid = await resolveAuthUserUuid(input.userId)
  if (!uuid) {
    return { stored: false, reason: "Guest uploads stay client-side until user signs in." }
  }

  const admin = createSupabaseAdminClient()
  if (!admin) return { stored: false, reason: "Admin client unavailable" }

  const bucket = storageBucket()
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `${uuid}/${Date.now()}-${safeName}`
  const body = input.buffer || (input.base64 ? decodeBase64(input.base64) : null)
  if (!body) return { stored: false, reason: "No file data" }

  const { error: uploadError } = await admin.storage.from(bucket).upload(path, body, {
    contentType: input.mime,
    upsert: false,
  })

  if (uploadError) {
    return { stored: false, reason: uploadError.message }
  }

  const { data: publicData } = admin.storage.from(bucket).getPublicUrl(path)
  const publicUrl = publicData?.publicUrl || ""

  await admin.from("uploaded_files").insert({
    user_id: uuid,
    session_id: input.sessionId || null,
    name: input.fileName,
    mime: input.mime,
    size_bytes: body.length,
    storage_path: path,
    public_url: publicUrl,
    kind: input.kind || "file",
  })

  return { stored: true, path, publicUrl, bucket }
}
