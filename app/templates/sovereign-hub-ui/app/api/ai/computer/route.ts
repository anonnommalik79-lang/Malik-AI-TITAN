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
  operation?: "start" | "poll" | "approve" | "cancel"
  approvalId?: string
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  return Response.json({ ok: true, ...malikComputerUseStatus() }, {
    headers: { "cache-control": "no-store" },
  })
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return Response.json({ ok: false, error: "INVALID_ORIGIN" }, { status: 403 })
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as Body
  const operation = body.operation || "start"
  if (!["start", "poll", "approve", "cancel"].includes(operation)) return Response.json({ ok: false, error: "INVALID_OPERATION" }, { status: 400 })
  if (["start", "approve"].includes(operation) && body.confirm !== true) {
    return Response.json({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
      message: "Computer-use execution requires explicit confirmation.",
    }, { status: 409 })
  }
  if (!malikComputerUseStatus().configured) return Response.json({ ok: false, error: "COMPUTER_NOT_CONFIGURED", message: "Браузерный сервис ещё не подключён. Действия на сайтах не выполнялись." }, { status: 503 })
  if (operation !== "start" && !body.sessionId) return Response.json({ ok: false, error: "SESSION_REQUIRED" }, { status: 400 })
  if (operation === "approve" && !body.approvalId) return Response.json({ ok: false, error: "ACTION_CONFIRMATION_REQUIRED" }, { status: 409 })

  try {
    const result = await runMalikComputerTask({
      task: String(body.task || ""),
      userId: entitlement.userId,
      sessionId: body.sessionId,
      mode: "browser",
      operation,
      approvalId: body.approvalId,
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
