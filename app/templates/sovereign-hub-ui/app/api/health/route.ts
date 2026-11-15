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
  })
}

