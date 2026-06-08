import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/server/supabase-admin"

export type UsageEventType = "chat" | "upload" | "video" | "image"

const memoryCache = new Map<string, number>()

function cacheKey(userId: string, eventType: UsageEventType) {
  return `${new Date().toISOString().slice(0, 10)}:${userId}:${eventType}`
}

function isGuestId(userId: string) {
  const v = userId.trim().toLowerCase()
  return !v || v === "guest" || v === "guest@local" || v === "guest@malik.ai"
}

export async function resolveAuthUserUuid(emailOrId: string): Promise<string | null> {
  if (!isSupabaseAdminConfigured() || isGuestId(emailOrId)) return null
  const admin = createSupabaseAdminClient()
  if (!admin) return null

  if (/^[0-9a-f-]{36}$/i.test(emailOrId)) return emailOrId

  const { data: profile } = await admin.from("profiles").select("id").eq("email", emailOrId.toLowerCase()).maybeSingle()
  if (profile?.id) return profile.id

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
  const match = users?.users?.find((u) => u.email?.toLowerCase() === emailOrId.toLowerCase())
  return match?.id || null
}

export async function getPersistedUsage(userId: string, eventType: UsageEventType): Promise<number> {
  const key = cacheKey(userId, eventType)
  if (memoryCache.has(key)) return memoryCache.get(key) || 0

  const uuid = await resolveAuthUserUuid(userId)
  if (!uuid) return memoryCache.get(key) || 0

  const admin = createSupabaseAdminClient()
  if (!admin) return 0

  const today = new Date().toISOString().slice(0, 10)
  const { data } = await admin
    .from("usage_events")
    .select("count")
    .eq("user_id", uuid)
    .eq("event_type", eventType)
    .eq("period_date", today)
    .maybeSingle()

  const count = data?.count || 0
  memoryCache.set(key, count)
  return count
}

export async function incrementPersistedUsage(userId: string, eventType: UsageEventType, delta = 1) {
  const key = cacheKey(userId, eventType)
  memoryCache.set(key, (memoryCache.get(key) || 0) + delta)

  const uuid = await resolveAuthUserUuid(userId)
  if (!uuid) return

  const admin = createSupabaseAdminClient()
  if (!admin) return

  const today = new Date().toISOString().slice(0, 10)
  const { data } = await admin
    .from("usage_events")
    .select("id, count")
    .eq("user_id", uuid)
    .eq("event_type", eventType)
    .eq("period_date", today)
    .maybeSingle()

  if (data?.id) {
    await admin.from("usage_events").update({ count: (data.count || 0) + delta }).eq("id", data.id)
    return
  }

  await admin.from("usage_events").insert({
    user_id: uuid,
    event_type: eventType,
    period_date: today,
    count: delta,
  })
}
