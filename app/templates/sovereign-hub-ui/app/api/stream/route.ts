import { asPlainText, malikGodAnswer } from "@/lib/malik-god-router"
import { applyFreshnessGuard, gateAiRequest, prepareAiBody, rateHeaders } from "@/lib/ai/request-security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function wantsSse(request: Request, body: any) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/event-stream") || body?.stream === true
}

function textResponse(content: string, headers: Record<string, string>) {
  return new Response(content || "MALIK AI: empty response prevented.", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-malik-router": "github-openrouter-deepseek-v14-secure",
      ...headers,
    },
  })
}

function sseResponse(content: string, headers: Record<string, string>) {
  const safe = content || "MALIK AI: empty response prevented."
  const payload =
    `data: ${JSON.stringify({ type: "content", content: safe })}\n\n` +
    `data: ${JSON.stringify({ type: "done" })}\n\n`

  return new Response(payload, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-malik-router": "github-openrouter-deepseek-v14-secure",
      ...headers,
    },
  })
}

export async function POST(request: Request) {
  const gate = gateAiRequest(request)
  if (!gate.ok) {
    return Response.json({ ok: false, error: gate.error }, { status: gate.status, headers: rateHeaders(gate) })
  }

  const rawBody = await request.json().catch(() => null)
  if (!rawBody || typeof rawBody !== "object") {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400, headers: rateHeaders(gate) })
  }

  const prepared = prepareAiBody(rawBody)
  if (!prepared.ok) {
    return Response.json({ ok: false, error: prepared.error }, { status: 400, headers: rateHeaders(gate) })
  }

  const answer = applyFreshnessGuard(await malikGodAnswer(prepared.body), prepared.latest)
  const content = asPlainText(answer)
  const headers = rateHeaders(gate)
  return wantsSse(request, rawBody) ? sseResponse(content, headers) : textResponse(content, headers)
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/stream", router: "MALIK SECURE CONTEXT ROUTER V14" })
}
