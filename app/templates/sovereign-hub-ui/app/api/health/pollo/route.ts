import { polloVideoEnabled, polloVideoModel, videoProviderPrimary } from "@/lib/media/config"
import { pingPollo } from "@/lib/media/providers/pollo"

export const runtime = "nodejs"

export async function GET() {
  const status = await pingPollo()
  return Response.json({
    ok: true,
    provider: "pollo",
    status,
    model: polloVideoModel(),
    videoProviderPrimary: videoProviderPrimary(),
    polloVideoEnabled: polloVideoEnabled(),
    amazon: "disabled",
    secretsExposed: false,
  })
}
