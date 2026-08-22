import { asJson, malikGodAnswer } from "@/lib/malik-god-router"
import { applyFreshnessGuard, gateAiRequest, prepareAiBody, rateHeaders } from "@/lib/ai/request-security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
  return Response.json(asJson(answer), {
    headers: {
      "cache-control": "no-store",
      "x-malik-router": "github-openrouter-deepseek-v14-secure",
      ...rateHeaders(gate),
    },
  })
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/ai/chat", router: "MALIK SECURE CONTEXT ROUTER V14" })
}
