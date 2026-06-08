import { getTitanProviderStatus } from "@/lib/ai/provider-status"

export const runtime = "nodejs"

export async function GET() {
  const status = getTitanProviderStatus()
  return Response.json({ ok: true, ...status })
}
