import { asJson, malikGodAnswer } from "@/lib/malik-god-router"
import {
  MalikModelRouteError,
  malikModelErrorPayload,
  resolveStrictMalikSelection,
} from "@/lib/server/malik-model-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  try {
    const selection = await resolveStrictMalikSelection(request, body)
    const answer = await malikGodAnswer(body, selection ? { modelId: selection.modelId } : undefined)
    return Response.json(asJson(answer), {
      headers: {
        "cache-control": "no-store",
        "x-malik-router": selection ? "strict-model-selection" : "github-openrouter-deepseek-v13",
      },
    })
  } catch (error) {
    const payload = malikModelErrorPayload(error)
    const status = error instanceof MalikModelRouteError ? error.status : 503
    return Response.json(payload, { status, headers: { "cache-control": "no-store" } })
  }
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/ai/chat", router: "MALIK GITHUB + OPENROUTER + DEEPSEEK V13" })
}
