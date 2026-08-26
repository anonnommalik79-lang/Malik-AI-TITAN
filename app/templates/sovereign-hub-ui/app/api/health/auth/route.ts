import { isWorkOSConfigured } from "@/lib/auth/server"

export const runtime = "nodejs"

export async function GET() {
  const configured = isWorkOSConfigured()

  return Response.json({
    ok: true,
    provider: "workos",
    configured,
    callback: "/callback",
    oauthProviders: [
      { id: "google", name: "Google", enabled: configured, configured },
      { id: "github", name: "GitHub", enabled: configured, configured },
    ],
  })
}
