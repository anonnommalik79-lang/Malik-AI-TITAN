import { getMediaProviderHealth } from "@/lib/media/health"

export const runtime = "nodejs"

export async function GET() {
  const health = await getMediaProviderHealth()
  return Response.json({
    ok: true,
    secretsExposed: false,
    ...health,
  })
}
