import { asJson, malikGodAnswer } from "@/lib/malik-god-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const answer = await malikGodAnswer(body)
  return Response.json(asJson(answer), {
    headers: {
      "cache-control": "no-store",
      "x-malik-router": "github-openrouter-deepseek-v13",
    },
  })
}

export async function GET() {
  return Response.json({ ok: true, route: "/api/ai/chat", router: "MALIK GITHUB + OPENROUTER + DEEPSEEK V13" })
}
