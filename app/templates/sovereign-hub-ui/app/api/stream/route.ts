import { asPlainText, malikGodAnswer } from "@/lib/malik-god-router"
import {
  MalikModelRouteError,
  malikModelErrorPayload,
  resolveStrictMalikSelection,
} from "@/lib/server/malik-model-router"
import { isFeatureDisabled, readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { prepareMalikActionRuntime } from "@/lib/server/malik-action-runtime"
import { malikActionPlanMarkdown, malikActionReceiptMarkdown, type MalikActionPlan } from "@/lib/ai/action-os"

import { withCompute, observeComputeResult } from "@/lib/malik-compute/runtime"
import { chatComputeOperation } from "@/lib/malik-compute/policies"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_CHAT_BODY_BYTES = 16 * 1024 * 1024
const MAX_TEXT_CONTEXT_CHARS = 260_000

function wantsSse(request: Request, body: any) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/event-stream") || body?.stream === true
}

function textResponse(content: string) {
  return new Response(content || "MALIK AI: empty response prevented.", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-malik-router": "github-openrouter-deepseek-v13-action-os",
    },
  })
}

function textualContextSize(body: any) {
  const direct = ["originalQuestion", "prompt", "message", "question", "input", "text", "content"]
    .reduce((sum, key) => sum + (typeof body?.[key] === "string" ? body[key].length : 0), 0)
  const messages = Array.isArray(body?.messages)
    ? body.messages.reduce((sum: number, item: any) => sum + (typeof item?.content === "string" ? item.content.length : 0), 0)
    : 0
  return direct + messages
}

function liveSseResponse(
  body: any,
  selection: Awaited<ReturnType<typeof resolveStrictMalikSelection>>,
  plan: MalikActionPlan,
) {
  const encoder = new TextEncoder()
  const startedAt = Date.now()
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (event: string, data: Record<string, unknown>) => {
        if (closed || cancelled) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify({ ...data, at: Date.now() })}\n\n`))
      }
      const close = () => {
        if (closed || cancelled) return
        closed = true
        controller.close()
      }

      send("status", { type: "status", text: "Malik AI принял запрос" })
      const planMarkdown = malikActionPlanMarkdown(plan)
      if (planMarkdown) {
        send("content", {
          type: "content",
          content: `${planMarkdown}\n\n`,
          actionPlanId: plan.id,
        })
      }

      void malikGodAnswer(
        body,
        selection ? { modelId: selection.modelId } : undefined,
        (progress) => send("progress", { type: "progress", ...progress }),
      ).then((answer) => {
        observeComputeResult(answer)
        send("content", {
          type: "content",
          content: asPlainText(answer) || "MALIK AI: empty response prevented.",
        })
        const receipt = malikActionReceiptMarkdown(plan)
        if (receipt) {
          send("content", {
            type: "content",
            content: `\n\n${receipt}`,
            actionPlanId: plan.id,
          })
        }
        send("done", {
          type: "done",
          provider: answer.provider,
          model: answer.model,
          selectedModelId: answer.selectedModelId,
          usedWeb: answer.usedWeb,
          sources: answer.sources,
          webSourceCount: answer.sources.length,
          tookMs: Date.now() - startedAt,
          actionPlan: plan.shouldRender ? {
            id: plan.id,
            intent: plan.intent,
            risk: plan.risk,
            requiresConfirmation: plan.requiresConfirmation,
            steps: plan.steps,
          } : undefined,
        })
        close()
      }).catch((error) => {
        const payload = malikModelErrorPayload(error)
        send("error", {
          type: "error",
          message: payload.message || payload.error || "Malik AI temporarily unavailable.",
        })
        close()
      })
    },
    cancel() { cancelled = true },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-malik-router": "github-openrouter-deepseek-v13-action-os",
      "x-malik-action-os": plan.shouldRender ? "active" : "passive",
    },
  })
}

export const POST = withCompute(handlePOST, chatComputeOperation)

async function handlePOST(request: Request) {
  if (isFeatureDisabled("chat")) {
    return Response.json({ ok: false, error: "CHAT_TEMPORARILY_DISABLED", message: "Malik AI chat is temporarily paused." }, {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "60" },
    })
  }

  let body: any
  try {
    body = await readJsonBodyLimited<any>(request, MAX_CHAT_BODY_BYTES)
  } catch (error) {
    if (error instanceof RequestSafetyError) {
      return Response.json({ ok: false, error: error.code, message: error.message }, {
        status: error.status,
        headers: { "cache-control": "no-store" },
      })
    }
    return Response.json({ ok: false, error: "INVALID_REQUEST", message: "Invalid request body." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    })
  }

  if (textualContextSize(body) > MAX_TEXT_CONTEXT_CHARS) {
    return Response.json({
      ok: false,
      error: "CONTEXT_TOO_LARGE",
      message: "Контекст слишком большой. Уменьшите текст или начните новый чат.",
      maxChars: MAX_TEXT_CONTEXT_CHARS,
    }, {
      status: 413,
      headers: { "cache-control": "no-store" },
    })
  }

  const prepared = prepareMalikActionRuntime(request, body)
  body = prepared.body

  try {
    const selection = await resolveStrictMalikSelection(request, body)
    if (wantsSse(request, body)) return liveSseResponse(body, selection, prepared.plan)
    const answer = await malikGodAnswer(body, selection ? { modelId: selection.modelId } : undefined)
    observeComputeResult(answer)
    const pieces = [
      malikActionPlanMarkdown(prepared.plan),
      asPlainText(answer),
      malikActionReceiptMarkdown(prepared.plan),
    ].filter(Boolean)
    return textResponse(pieces.join("\n\n"))
  } catch (error) {
    const payload = malikModelErrorPayload(error)
    const status = error instanceof MalikModelRouteError ? error.status : 503
    return Response.json(payload, {
      status,
      headers: { "cache-control": "no-store" },
    })
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    route: "/api/stream",
    status: isFeatureDisabled("chat") ? "paused" : "ready",
    actionOS: "malik-action-os-v1",
    memoryBridge: "same-origin-user-controlled",
    limits: {
      maxBodyMb: MAX_CHAT_BODY_BYTES / (1024 * 1024),
      maxTextContextChars: MAX_TEXT_CONTEXT_CHARS,
    },
  }, {
    headers: { "cache-control": "no-store" },
  })
}
