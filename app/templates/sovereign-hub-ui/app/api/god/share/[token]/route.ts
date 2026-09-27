import { resolvePublicProjectShare } from "@/lib/god-mode/share"
import { createGodTrace, withGodTraceHeaders } from "@/lib/god-mode/trace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ token: string }> }

export async function GET(request: Request, context: Context) {
  const trace = createGodTrace(request)
  const { token } = await context.params
  const shared = await resolvePublicProjectShare(token)
  if (!shared) {
    return withGodTraceHeaders(Response.json({
      ok: false,
      code: "SHARE_NOT_FOUND",
      error: "Ссылка недействительна или истекла.",
    }, { status: 404, headers: { "cache-control": "private, no-store" } }), trace, { operation: "project-share", budgetMs: 1500 })
  }

  return withGodTraceHeaders(Response.json({
    ok: true,
    readOnly: true,
    expiresAt: shared.expiresAt,
    project: shared.project,
  }, { headers: {
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow",
  } }), trace, { operation: "project-share", budgetMs: 1500 })
}
