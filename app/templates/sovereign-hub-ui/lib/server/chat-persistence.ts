import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/server/supabase-admin"
import { resolveAuthUserUuid } from "@/lib/server/usage-persistence"

export async function persistChatExchange(input: {
  userEmail: string
  sessionId?: string
  title?: string
  userMessage: string
  assistantMessage: string
  provider?: string
}) {
  if (!isSupabaseAdminConfigured()) return { saved: false, reason: "supabase_missing" }

  const userId = await resolveAuthUserUuid(input.userEmail)
  if (!userId) return { saved: false, reason: "guest_or_unknown_user" }

  const admin = createSupabaseAdminClient()
  if (!admin) return { saved: false, reason: "admin_client_missing" }

  let sessionId = input.sessionId
  if (!sessionId) {
    const { data: existing } = await admin
      .from("chat_sessions")
      .select("id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    sessionId = existing?.id
  }

  if (!sessionId) {
    const { data: created, error } = await admin
      .from("chat_sessions")
      .insert({
        user_id: userId,
        title: (input.title || input.userMessage).slice(0, 80) || "New chat",
        status: "draft",
      })
      .select("id")
      .single()
    if (error || !created?.id) return { saved: false, reason: error?.message || "session_create_failed" }
    sessionId = created.id
  }

  const rows = [
    { session_id: sessionId, user_id: userId, role: "user", content: input.userMessage },
    {
      session_id: sessionId,
      user_id: userId,
      role: "assistant",
      content: input.assistantMessage,
      provider_used: input.provider || null,
    },
  ]

  const { error } = await admin.from("chat_messages").insert(rows)
  if (error) return { saved: false, reason: error.message }

  await admin.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId)
  return { saved: true, sessionId }
}
