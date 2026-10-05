import { asJson, extractPrompt, malikGodAnswer } from "@/lib/malik-god-router"
import { DEFAULT_MALIK_MODEL_ID, hasMalikProAccess } from "@/lib/ai/malik-models"
import { withFounderRequestAudit } from "@/lib/server/founder-request-audit"
import { parsePluginCommandFromBody } from "@/lib/server/plugin-runtime"
import { runPluginModelAnswer } from "@/lib/server/plugin-model-answer"
import {
  MalikModelRouteError,
  malikModelErrorPayload,
  resolveStrictMalikSelection,
} from "@/lib/server/malik-model-router"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { malikIdentityAnswer, withVerifiedOwnerChatContext } from "@/lib/server/malik-owner-context"
import { getDailyTextTokenQuota } from "@/lib/server/daily-text-token-quota"

import { withCompute } from "@/lib/malik-compute/runtime"
import { chatComputeOperation } from "@/lib/malik-compute/policies"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = withFounderRequestAudit(withCompute(handlePOST, async (request) => { const body = await request.clone().json().catch(() => ({})); return parsePluginCommandFromBody(body) ? "plugin" : chatComputeOperation(request) }), "chat")

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))

  const pluginCommand = parsePluginCommandFromBody(body)

  try {
    const selection = await resolveStrictMalikSelection(request, body)
    const entitlement = selection?.entitlement ?? await resolveRequestEntitlement(request)
    const ownerMode = entitlement.plan === "owner"
    const textQuota = getDailyTextTokenQuota(entitlement.userId, ownerMode)
    const requestedMaxTokens = Number(body?.maxTokens)
    const maxOutputTokens = textQuota.unlimited
      ? (Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0 ? Math.floor(requestedMaxTokens) : undefined)
      : Math.min(
          Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0 ? Math.floor(requestedMaxTokens) : Number.MAX_SAFE_INTEGER,
          Math.max(1, Math.floor(textQuota.remaining ?? 0)),
        )

    // Founder/company identity is deterministic. Providers never get a chance
    // to invent a developer team or another company for MALIK AI.
    const identity = malikIdentityAnswer(body, ownerMode)
    if (identity) {
      return Response.json({
        ok: true,
        content: identity,
        provider: "malik-identity-core",
        model: "verified-brand-profile",
        selectedModelId: selection?.modelId || DEFAULT_MALIK_MODEL_ID,
        usedWeb: false,
        sources: [],
        attempts: [],
      }, {
        headers: {
          "cache-control": "no-store",
          "x-malik-router": "verified-founder-identity",
        },
      })
    }

    // Only a server-verified owner session receives this context. Client body
    // fields such as email/username can never grant founder mode.
    const quotaBoundBody = maxOutputTokens
      ? { ...body, maxTokens: maxOutputTokens, maxTokensCap: textQuota.unlimited ? undefined : Math.max(1, Math.floor(textQuota.remaining ?? 0)) }
      : body
    const routedBody = ownerMode ? withVerifiedOwnerChatContext(quotaBoundBody) : quotaBoundBody
    if (pluginCommand) {
      const result = await runPluginModelAnswer(pluginCommand, routedBody, {
        modelId: selection?.modelId || DEFAULT_MALIK_MODEL_ID,
        allowCatalog: Boolean(selection && hasMalikProAccess(selection.entitlement.plan)),
      })
      if (!result.modelUsed) {
        return Response.json({ ...result.answer, ok: result.live }, {
          headers: { "cache-control": "no-store", "x-malik-router": "plugin-runtime-v1", "x-malik-plugin": result.plugin.pluginId },
        })
      }
      return Response.json({ ...asJson(result.answer), pluginId: result.plugin.pluginId, pluginName: result.plugin.pluginName, connected: true }, {
        headers: { "cache-control": "no-store", "x-malik-router": "plugin-model-context-v1", "x-malik-plugin": result.plugin.pluginId },
      })
    }

    const answer = await malikGodAnswer(routedBody, {
      modelId: selection?.modelId || DEFAULT_MALIK_MODEL_ID,
      allowCatalog: Boolean(selection && hasMalikProAccess(selection.entitlement.plan)),
    })
    const payload = asJson(answer)

    return Response.json(payload, {
      headers: {
        "cache-control": "no-store",
        "x-malik-router": selection ? "strict-model-selection" : "malik-max-router",
      },
    })
  } catch (error) {
    const payload = malikModelErrorPayload(error)
    const status = error instanceof MalikModelRouteError ? error.status : 503
    return Response.json(payload, { status, headers: { "cache-control": "no-store" } })
  }
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/ai/chat", router: "MalikLLM MAX + strict model selection + plugins", defaultModel: DEFAULT_MALIK_MODEL_ID })
}
