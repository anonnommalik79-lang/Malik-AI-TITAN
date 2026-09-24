import { callMalikMcpTool, listMalikMcpServers, listMalikMcpTools } from "@/lib/server/mcp-runtime"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

type Body = {
  serverId?: string
  action?: "tools/list" | "tools/call"
  toolName?: string
  arguments?: Record<string, unknown>
  confirm?: boolean
}

export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  }
  return Response.json({
    ok: true,
    protocol: "MCP streamable HTTP",
    servers: listMalikMcpServers(),
  }, { headers: { "cache-control": "no-store" } })
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return Response.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as Body
  const serverId = String(body.serverId || "").trim()
  const action = body.action || "tools/list"
  if (!serverId) return Response.json({ ok: false, error: "MCP_SERVER_REQUIRED" }, { status: 400 })

  try {
    if (action === "tools/list") {
      return Response.json({ ok: true, ...(await listMalikMcpTools(serverId)) }, {
        headers: { "cache-control": "no-store" },
      })
    }

    if (action === "tools/call") {
      if (body.confirm !== true) {
        return Response.json({
          ok: false,
          error: "CONFIRMATION_REQUIRED",
          message: "MCP tool execution requires explicit confirmation.",
        }, { status: 409 })
      }
      const toolName = String(body.toolName || "").trim()
      if (!toolName) return Response.json({ ok: false, error: "MCP_TOOL_REQUIRED" }, { status: 400 })
      return Response.json({
        ok: true,
        ...(await callMalikMcpTool(serverId, toolName, body.arguments || {})),
      }, { headers: { "cache-control": "no-store" } })
    }

    return Response.json({ ok: false, error: "INVALID_MCP_ACTION" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({
      ok: false,
      error: "MCP_RUNTIME_ERROR",
      message: message.slice(0, 800),
    }, { status: 502, headers: { "cache-control": "no-store" } })
  }
}
