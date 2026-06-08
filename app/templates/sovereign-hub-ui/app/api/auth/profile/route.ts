import { createSupabaseUserClient, isServerSupabaseConfigured } from "@/lib/server/supabase-user"

export const runtime = "nodejs"

function bearer(request: Request) {
  const value = request.headers.get("authorization") || ""
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : ""
}

export async function POST(request: Request) {
  if (!isServerSupabaseConfigured()) {
    return Response.json({ ok: false, status: "setup_required", message: "Identity sync is being prepared on the server." }, { status: 503 })
  }
  const token = bearer(request)
  const client = createSupabaseUserClient(token)
  if (!client) return Response.json({ ok: false, error: "secure_session_required" }, { status: 401 })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user?.id || !data.user.email) return Response.json({ ok: false, error: "secure_session_required" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const profile = {
    id: data.user.id,
    email: data.user.email.toLowerCase(),
    display_name: String(body?.name || data.user.user_metadata?.full_name || data.user.email.split("@")[0]).slice(0, 120),
    avatar_url: String(body?.avatar || data.user.user_metadata?.avatar_url || "").slice(0, 1200),
    updated_at: new Date().toISOString(),
  }
  const result = await client.from("profiles").upsert(profile, { onConflict: "id" })
  if (result.error) {
    return Response.json({ ok: true, profile: { email: profile.email, displayName: profile.display_name }, databaseSynced: false, message: "Profile session is ready. Database sync is being prepared." })
  }
  return Response.json({ ok: true, profile: { email: profile.email, displayName: profile.display_name }, databaseSynced: true })
}
