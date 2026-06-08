import { imageProviderFallback, imageProviderPrimary } from "@/lib/media/config"
import { pingPollinations } from "@/lib/media/providers/pollinations"
import { pingStability } from "@/lib/media/providers/stability"

export const runtime = "nodejs"

export async function GET() {
  const [stability, pollinations] = await Promise.all([pingStability(), pingPollinations()])
  return Response.json({
    ok: true,
    secretsExposed: false,
    stability,
    pollinations,
    amazon: "disabled",
    imageProviderPrimary: imageProviderPrimary(),
    imageProviderFallback: imageProviderFallback(),
  })
}
