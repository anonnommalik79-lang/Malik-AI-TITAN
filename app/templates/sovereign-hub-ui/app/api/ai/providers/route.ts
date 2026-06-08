import { getPublicEngineReadiness } from "@/lib/provider-status"

export async function GET() {
  return Response.json({ ok: true, engines: getPublicEngineReadiness() })
}
