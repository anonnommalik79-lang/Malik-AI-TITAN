import { executeMalikCode, malikCodeExecutionStatus } from "@/lib/server/code-execution-runtime"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

type Body = {
  language?: string
  code?: string
  stdin?: string
  confirm?: boolean
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  return Response.json({ ok: true, ...malikCodeExecutionStatus() }, {
    headers: { "cache-control": "no-store" },
  })
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as Body
  if (body.confirm !== true) {
    return Response.json({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
      message: "Running code requires explicit confirmation.",
    }, { status: 409 })
  }

  try {
    const result = await executeMalikCode({
      language: body.language,
      code: String(body.code || ""),
      stdin: body.stdin,
    })
    return Response.json(result, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({
      ok: false,
      error: "CODE_EXECUTION_FAILED",
      message: message.slice(0, 900),
      ...malikCodeExecutionStatus(),
    }, { status: 502, headers: { "cache-control": "no-store" } })
  }
}
