import { getSocialProviders } from "@/lib/auth/social-providers"
import { isSupabaseConfigured } from "@/lib/supabase"

export const runtime = "nodejs"

export async function GET() {
  const configured = isSupabaseConfigured()
  const providers = getSocialProviders()
  return Response.json({
    ok: true,
    supabase: configured ? "configured" : "missing",
    guestModeActive: !configured,
    oauthProviders: providers.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled && p.configured,
      configured: p.configured,
    })),
  })
}
