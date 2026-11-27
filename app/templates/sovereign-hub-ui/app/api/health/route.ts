import { isMalikFlashBrowserReady } from "@/lib/server/malik-flash-browser-bridge"
import { flashGoogleSearchStatus } from "@/lib/server/malik-flash-google-search"

export const runtime = "nodejs"

export async function GET() {
  return Response.json({
    ok: true,
    status: "online",
    service: "malik-ai-sovereign-hub",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    secretsExposed: false,
    // Whether MalikLLM Flash answers with Gemini and Google Search: the switch and a key are seen, never the keys.
    flashGoogleSearch: flashGoogleSearchStatus(),
    // Configuration is not proof of live Google access. Never expose worker credentials.
    flashGoogleAiMode: {
      provider: "google-ai-mode-browser",
      status: isMalikFlashBrowserReady() ? "configured-unverified" : "disabled-or-unconfigured",
      liveVerified: false,
    },
  })
}

