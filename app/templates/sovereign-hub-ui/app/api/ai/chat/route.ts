import { asJson, malikGodAnswer } from "@/lib/malik-god-router"
import { parsePluginCommandFromBody, runMalikPlugin } from "@/lib/server/plugin-runtime"
import {
  MalikModelRouteError,
  malikModelErrorPayload,
  resolveStrictMalikSelection,
} from "@/lib/server/malik-model-router"

import { withCompute } from "@/lib/malik-compute/runtime"
import { chatComputeOperation } from "@/lib/malik-compute/policies"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = withCompute(handlePOST, async (request) => { const body = await request.clone().json().catch(() => ({})); return parsePluginCommandFromBody(body) ? "plugin" : chatComputeOperation(request) })

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))

  // Plugin commands are intentionally intercepted before the model router.
  // This makes a selected plugin a real server-side tool call instead of a
  // decorative prompt that hallucinates access to an external service.
  const pluginCommand = parsePluginCommandFromBody(body)
  if (pluginCommand) {
    const result = await runMalikPlugin(pluginCommand.id, pluginCommand.query)
    return Response.json(result, {
      headers: {
        "cache-control": "no-store",
        "x-malik-router": "plugin-runtime-v1",
        "x-malik-plugin": result.pluginId,
      },
    })
  }

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
  return Response.json({ ok: true, route: "/api/ai/chat", router: "MALIK GITHUB + OPENROUTER + DEEPSEEK V13 + PLUGINS" })
}
