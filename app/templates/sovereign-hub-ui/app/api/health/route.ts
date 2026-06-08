export const runtime = "nodejs"

export async function GET() {
  return Response.json({
    ok: true,
    status: "online",
    service: "malik-ai-sovereign-hub",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    secretsExposed: false,
  })
}

