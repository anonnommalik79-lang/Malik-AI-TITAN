import { isServerSupabaseConfigured } from "@/lib/server/supabase-user"

export const runtime = "nodejs"

export async function GET() {
  const ready = isServerSupabaseConfigured()
  return Response.json({
    ok: true,
    identity: {
      title: "Sovereign ID",
      ready,
      mode: ready ? "secure-login-ready" : "guest-mode-ready",
      socialLogin: ready,
      emailRegistration: ready,
      guestMode: true,
    },
  })
}
