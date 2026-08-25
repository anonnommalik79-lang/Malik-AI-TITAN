import { asPlainText, malikGodAnswer } from "@/lib/malik-god-router"
import {
  MalikModelRouteError,
  malikModelErrorPayload,
  resolveStrictMalikSelection,
} from "@/lib/server/malik-model-router"

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

function sseResponse(content: string) {
  const safe = content || "MALIK AI: empty response prevented."
  const payload =
    `data: ${JSON.stringify({ type: "content", content: safe })}\n\n` +
    `data: ${JSON.stringify({ type: "done" })}\n\n`

  return new Response(payload, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-malik-router": "github-openrouter-deepseek-v13",
    },
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  try {
    const selection = await resolveStrictMalikSelection(request, body)
    const answer = await malikGodAnswer(body, selection ? { modelId: selection.modelId } : undefined)
    const content = asPlainText(answer)
    return wantsSse(request, body) ? sseResponse(content) : textResponse(content)
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
