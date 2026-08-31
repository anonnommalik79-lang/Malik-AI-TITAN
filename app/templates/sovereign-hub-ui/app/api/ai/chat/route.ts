import { asJson, malikGodAnswer } from "@/lib/malik-god-router"
import { malikActionPlanMarkdown, malikActionReceiptMarkdown } from "@/lib/ai/action-os"
import { parsePluginCommandFromBody, runMalikPlugin } from "@/lib/server/plugin-runtime"
import { prepareMalikActionRuntime } from "@/lib/server/malik-action-runtime"
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
  let body = await request.json().catch(() => ({}))

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

  const prepared = prepareMalikActionRuntime(request, body)
  body = prepared.body

  try {
    const selection = await resolveStrictMalikSelection(request, body)
    const answer = await malikGodAnswer(body, selection ? { modelId: selection.modelId } : undefined)
    const payload: any = asJson(answer)
    const pieces = [
      malikActionPlanMarkdown(prepared.plan),
      typeof payload?.content === "string" ? payload.content : "",
      malikActionReceiptMarkdown(prepared.plan),
    ].filter(Boolean)

    if (pieces.length) payload.content = pieces.join("\n\n")
    if (prepared.plan.shouldRender) {
      payload.actionPlan = {
        id: prepared.plan.id,
        version: prepared.plan.version,
        intent: prepared.plan.intent,
        risk: prepared.plan.risk,
        requiresConfirmation: prepared.plan.requiresConfirmation,
        steps: prepared.plan.steps,
      }
    }
    payload.memoryItemCount = prepared.memoryItems.length

    return Response.json(payload, {
      headers: {
        "cache-control": "no-store",
        "x-malik-router": selection ? "strict-model-selection-action-os" : "github-openrouter-deepseek-v13-action-os",
        "x-malik-action-os": prepared.plan.shouldRender ? "active" : "passive",
      },
    })
  } catch (error) {
    const payload = malikModelErrorPayload(error)
    const status = error instanceof MalikModelRouteError ? error.status : 503
    return Response.json(payload, { status, headers: { "cache-control": "no-store" } })
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    route: "/api/ai/chat",
    router: "MALIK GITHUB + OPENROUTER + DEEPSEEK V13 + PLUGINS + ACTION OS",
    actionOS: "malik-action-os-v1",
  })
}
