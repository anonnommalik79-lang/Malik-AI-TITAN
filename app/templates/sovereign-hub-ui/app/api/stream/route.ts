import { asPlainText, malikGodAnswer } from "@/lib/malik-god-router"
import {
  MalikModelRouteError,
  malikModelErrorPayload,
  resolveStrictMalikSelection,
} from "@/lib/server/malik-model-router"

import { withCompute, observeComputeResult } from "@/lib/malik-compute/runtime"
import { chatComputeOperation } from "@/lib/malik-compute/policies"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function wantsSse(request: Request, body: any) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/event-stream") || body?.stream === true
}

function textResponse(content: string) {
  return new Response(content || "MALIK AI: empty response prevented.", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-malik-router": "github-openrouter-deepseek-v13",
    },
  })
}

function liveSseResponse(
  body: any,
  selection: Awaited<ReturnType<typeof resolveStrictMalikSelection>>,
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
        send("done", {
          type: "done",
          provider: answer.provider,
          model: answer.model,
          selectedModelId: answer.selectedModelId,
          usedWeb: answer.usedWeb,
          sources: answer.sources,
          webSourceCount: answer.sources.length,
          tookMs: Date.now() - startedAt,
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
      "x-malik-router": "github-openrouter-deepseek-v13",
    },
  })
}

export const POST = withCompute(handlePOST, chatComputeOperation)

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({}))
  try {
    const selection = await resolveStrictMalikSelection(request, body)
    if (wantsSse(request, body)) return liveSseResponse(body, selection)
    const answer = await malikGodAnswer(body, selection ? { modelId: selection.modelId } : undefined)
    observeComputeResult(answer)
    const content = asPlainText(answer)
    return textResponse(content)
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
    router: "MALIK GITHUB + OPENROUTER + DEEPSEEK V13",
    env: {
      github: Boolean(process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_TOKEN),
      githubModel: process.env.GITHUB_MODEL || null,
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      serper: Boolean(process.env.SERPER_API_KEY),
      tavily: Boolean(process.env.TAVILY_API_KEY),
      brave: Boolean(process.env.BRAVE_SEARCH_API_KEY),
      chain: process.env.MALIK_GOD_PROVIDER_CHAIN || null,
    },
  })
}
