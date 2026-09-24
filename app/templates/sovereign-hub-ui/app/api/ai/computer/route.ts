import { malikComputerUseStatus, runMalikComputerTask } from "@/lib/server/computer-use-runtime"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type Body = {
  task?: string
  sessionId?: string
  mode?: "browser" | "desktop"
  confirm?: boolean
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  return Response.json({ ok: true, ...malikComputerUseStatus() }, {
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
      message: "Computer-use execution requires explicit confirmation.",
    }, { status: 409 })
  }

  try {
    const result = await runMalikComputerTask({
      task: String(body.task || ""),
      sessionId: body.sessionId,
      mode: body.mode,
    })
    return Response.json(result, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({
      ok: false,
      error: "COMPUTER_USE_FAILED",
      message: message.slice(0, 900),
      ...malikComputerUseStatus(),
    }, { status: 502, headers: { "cache-control": "no-store" } })
  }
}
