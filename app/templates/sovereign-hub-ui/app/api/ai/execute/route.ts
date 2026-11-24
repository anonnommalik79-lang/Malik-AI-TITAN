import { executeMalikCode, malikCodeExecutionStatus } from "@/lib/server/code-execution-runtime"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

import { takeSharedRequestFrequency } from "@/lib/server/request-frequency"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"

const inFlight = new Set<string>()

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

  if (!await takeSharedRequestFrequency("code-execution", entitlement.userId, 4)) {
    return Response.json({ ok: false, error: "RATE_LIMIT_REACHED" }, { status: 429 })
  }
  let body: Body
  try {
    body = await readJsonBodyLimited<Body>(request, 512 * 1024)
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_JSON")
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof RequestSafetyError ? error.code : "INVALID_JSON" }, { status: error instanceof RequestSafetyError ? error.status : 400 })
  }
  if (body.confirm !== true) {
    return Response.json({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
      message: "Running code requires explicit confirmation.",
    }, { status: 409 })
  }

  if (inFlight.has(entitlement.userId) || inFlight.size >= 8) {
    return Response.json({ ok: false, error: "EXECUTION_BUSY" }, { status: 429 })
  }
  inFlight.add(entitlement.userId)
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
  } finally {
    inFlight.delete(entitlement.userId)
  }
}
