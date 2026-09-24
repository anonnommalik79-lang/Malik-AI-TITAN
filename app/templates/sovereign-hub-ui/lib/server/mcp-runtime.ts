import "server-only"

export type MalikMcpServerPublic = {
  id: string
  name: string
  configured: boolean
}

type MalikMcpServerConfig = {
  id: string
  name: string
  url: string
  authorizationEnv?: string
  headers?: Record<string, string>
}

type RpcEnvelope = {
  jsonrpc?: string
  id?: string | number | null
  result?: any
  error?: { code?: number; message?: string; data?: unknown }
}

const PROTOCOL_VERSION = "2025-03-26"
const MAX_TOOL_RESULT_CHARS = 120_000

function safeId(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80)
}

function safeName(value: unknown, fallback: string) {
  return String(value || fallback).replace(/\s+/g, " ").trim().slice(0, 120) || fallback
}

function allowedUrl(value: unknown) {
  const raw = String(value || "").trim()
  try {
    const url = new URL(raw)
    if (url.protocol === "https:") return url.toString()
    if (process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) {
      return url.toString()
    }
  } catch {}
  return ""
}

function configuredServers(): MalikMcpServerConfig[] {
  const raw = String(process.env.MALIK_MCP_SERVERS_JSON || "").trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): MalikMcpServerConfig[] => {
      if (!item || typeof item !== "object") return []
      const id = safeId((item as any).id)
      const url = allowedUrl((item as any).url)
      if (!id || !url) return []
      const headersRaw = (item as any).headers
      const headers = headersRaw && typeof headersRaw === "object"
        ? Object.fromEntries(Object.entries(headersRaw).flatMap(([key, value]) => {
            const cleanKey = String(key || "").trim()
            const cleanValue = String(value || "").trim()
            if (!cleanKey || !cleanValue || /authorization|cookie|token|secret|key/i.test(cleanKey)) return []
            return [[cleanKey.slice(0, 80), cleanValue.slice(0, 500)]]
          }))
        : undefined
      return [{
        id,
        name: safeName((item as any).name, id),
        url,
        authorizationEnv: safeId((item as any).authorizationEnv || "").toUpperCase().replace(/-/g, "_") || undefined,
        headers,
      }]
    }).slice(0, 24)
  } catch {
    return []
  }
}

export function listMalikMcpServers(): MalikMcpServerPublic[] {
  return configuredServers().map((server) => ({
    id: server.id,
    name: server.name,
    configured: true,
  }))
}

function serverById(idValue: unknown) {
  const id = safeId(idValue)
  return configuredServers().find((server) => server.id === id) || null
}

function authHeaders(server: MalikMcpServerConfig) {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...server.headers,
  }
  if (server.authorizationEnv) {
    const token = String(process.env[server.authorizationEnv] || "").trim()
    if (token) headers.Authorization = token.startsWith("Bearer ") ? token : "Bearer " + token
  }
  return headers
}

function parseSseBody(text: string): RpcEnvelope | null {
  const frames = text.split(/\r?\n\r?\n/)
  for (const frame of frames) {
    for (const line of frame.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue
      const raw = line.slice(5).trim()
      if (!raw || raw === "[DONE]") continue
      try {
        const value = JSON.parse(raw)
        if (value && typeof value === "object") return value as RpcEnvelope
      } catch {}
    }
  }
  return null
}

async function rpcRequest(
  server: MalikMcpServerConfig,
  method: string,
  params: Record<string, unknown> | undefined,
  sessionId?: string,
  notification = false,
) {
  const controller = new AbortController()
  const timeoutMs = Math.max(3_000, Math.min(60_000, Number(process.env.MALIK_MCP_TIMEOUT_MS || 20_000)))
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = authHeaders(server)
    if (sessionId) headers["mcp-session-id"] = sessionId
    const body = {
      jsonrpc: "2.0",
      ...(notification ? {} : { id: crypto.randomUUID() }),
      method,
      ...(params ? { params } : {}),
    }
    const response = await fetch(server.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    })
    const nextSessionId = response.headers.get("mcp-session-id") || sessionId || ""
    const text = await response.text()
    if (!response.ok) throw new Error("MCP " + server.id + " HTTP " + response.status + ": " + text.slice(0, 500))
    if (notification) return { envelope: null as RpcEnvelope | null, sessionId: nextSessionId }
    let envelope: RpcEnvelope | null = null
    try {
      envelope = JSON.parse(text) as RpcEnvelope
    } catch {
      envelope = parseSseBody(text)
    }
    if (!envelope) throw new Error("MCP " + server.id + " returned an unreadable response")
    if (envelope.error) throw new Error("MCP " + server.id + ": " + String(envelope.error.message || envelope.error.code || "tool error"))
    return { envelope, sessionId: nextSessionId }
  } finally {
    clearTimeout(timer)
  }
}

async function withSession<T>(server: MalikMcpServerConfig, run: (sessionId: string) => Promise<T>) {
  const initialized = await rpcRequest(server, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "MALIK AI", version: "6.5" },
  })
  const sessionId = initialized.sessionId
  await rpcRequest(server, "notifications/initialized", undefined, sessionId, true).catch(() => null)
  return run(sessionId)
}

export async function listMalikMcpTools(serverId: string) {
  const server = serverById(serverId)
  if (!server) throw new Error("MCP server is not configured")
  const result = await withSession(server, async (sessionId) => {
    const response = await rpcRequest(server, "tools/list", {}, sessionId)
    const tools = Array.isArray(response.envelope?.result?.tools) ? response.envelope!.result.tools : []
    return tools.slice(0, 200).map((tool: any) => ({
      name: String(tool?.name || "").slice(0, 160),
      description: String(tool?.description || "").slice(0, 2_000),
      inputSchema: tool?.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : {},
    })).filter((tool: any) => tool.name)
  })
  return { server: { id: server.id, name: server.name }, tools: result }
}

export async function callMalikMcpTool(serverId: string, toolNameValue: string, args: Record<string, unknown>) {
  const server = serverById(serverId)
  if (!server) throw new Error("MCP server is not configured")
  const toolName = String(toolNameValue || "").trim().slice(0, 160)
  if (!toolName) throw new Error("MCP tool name is required")

  const result = await withSession(server, async (sessionId) => {
    const listed = await rpcRequest(server, "tools/list", {}, sessionId)
    const tools = Array.isArray(listed.envelope?.result?.tools) ? listed.envelope!.result.tools : []
    if (!tools.some((tool: any) => String(tool?.name || "") === toolName)) {
      throw new Error("MCP tool is not advertised by the configured server")
    }
    const called = await rpcRequest(server, "tools/call", {
      name: toolName,
      arguments: args && typeof args === "object" ? args : {},
    }, sessionId)
    const raw = JSON.stringify(called.envelope?.result ?? {})
    return raw.length > MAX_TOOL_RESULT_CHARS
      ? raw.slice(0, MAX_TOOL_RESULT_CHARS) + "\n[TRUNCATED]"
      : raw
  })

  return {
    server: { id: server.id, name: server.name },
    tool: toolName,
    result,
  }
}
