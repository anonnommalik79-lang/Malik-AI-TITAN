import { handleGenerateRequest } from "@/lib/generation-route"

import { withCompute } from "@/lib/malik-compute/runtime"
import { generationComputeOperation } from "@/lib/malik-compute/policies"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type RouteContext = { params: Promise<{ kind?: string }> | { kind?: string } }

const SUPPORTED_KINDS = new Set([
  "text",
  "photo",
  "image",
  "video",
  "audio",
  "code",
  "website",
  "landing",
  "dashboard",
  "component",
  "document",
  "presentation",
  "template",
])

const KIND_ALIASES: Record<string, string> = {
  images: "photo",
  image: "photo",
  pictures: "photo",
  picture: "photo",
  photos: "photo",
  video_generation: "video",
  image_generation: "photo",
  site: "website",
  web: "website",
  landingPage: "landing",
  landing_generation: "landing",
  dashboard_generation: "dashboard",
  component_generation: "component",
  template_generation: "template",
  document_generation: "document",
  presentation_generation: "presentation",
  deck: "presentation",
  slides: "presentation",
  ppt: "presentation",
  pptx: "presentation",
  docs: "document",
  doc: "document",
  file: "document",
  ui: "component",
  tsx: "code",
  react: "code",
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Malik-Request-Id, X-Requested-With",
  "Access-Control-Max-Age": "86400",
} as const

function requestId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `malik-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function cleanKind(value?: string) {
  const raw = String(value || "").trim()
  const normalized = raw
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/_/g, "-")
  const lower = normalized.toLowerCase()
  return KIND_ALIASES[raw] || KIND_ALIASES[normalized] || KIND_ALIASES[lower] || lower
}

async function readKind(context: RouteContext) {
  const params = await Promise.resolve(context.params)
  return cleanKind(params?.kind)
}

function publicError(error: unknown) {
  if (error instanceof Error) return error.message || "Generation route failed"
  return String(error || "Generation route failed")
}

function withCors(response: Response, kind: string, id = requestId()) {
  const headers = new Headers(response.headers)
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value))
  headers.set("X-Malik-Request-Id", id)
  headers.set("X-Malik-Route", `/api/generate/${kind}`)
  headers.set("X-Malik-Kind", kind)
  headers.set("X-Malik-Runtime", "nodejs")
  headers.set("X-Malik-Generation-Gateway", "titan-kind")
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function json(payload: unknown, init?: ResponseInit, id = requestId(), kind = "unknown") {
  const headers = new Headers(init?.headers)
  headers.set("Content-Type", "application/json; charset=utf-8")
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value))
  headers.set("X-Malik-Request-Id", id)
  headers.set("X-Malik-Route", `/api/generate/${kind}`)
  headers.set("X-Malik-Kind", kind)
  headers.set("X-Malik-Generation-Gateway", "titan-kind")
  return Response.json(payload, { ...init, headers })
}

function invalidKind(kind: string, id: string) {
  return json({
    ok: false,
    publicError: "unsupported_generation_kind",
    message: `Unsupported generation kind: ${kind || "empty"}`,
    kind,
    supportedKinds: Array.from(SUPPORTED_KINDS),
    aliases: KIND_ALIASES,
    requestId: id,
  }, { status: 400 }, id, kind || "unknown")
}

export const POST = withCompute(handlePOST, generationComputeOperation)

async function handlePOST(request: Request, context: RouteContext) {
  const id = request.headers.get("X-Malik-Request-Id") || requestId()
  const kind = await readKind(context)

  if (!SUPPORTED_KINDS.has(kind)) return invalidKind(kind, id)

  try {
    const startedAt = Date.now()
    const response = await handleGenerateRequest(request, kind)
    const wrapped = withCors(response, kind, id)
    wrapped.headers.set("X-Malik-Duration-Ms", String(Date.now() - startedAt))
    return wrapped
  } catch (error) {
    return json({
      ok: false,
      route: `/api/generate/${kind}`,
      kind,
      publicError: "generation_kind_gateway_failed",
      message: "MALIK AI kind route could not complete the request. Safe client fallback may continue the demo.",
      detail: publicError(error),
      requestId: id,
    }, { status: 500 }, id, kind)
  }
}

export async function GET(request: Request, context: RouteContext) {
  const id = request.headers.get("X-Malik-Request-Id") || requestId()
  const kind = await readKind(context)
  if (!SUPPORTED_KINDS.has(kind)) return invalidKind(kind, id)

  return json({
    ok: true,
    product: "MALIK AI 6.5 TITAN",
    route: `/api/generate/${kind}`,
    method: "POST",
    runtime,
    kind,
    explicitKindRouting: true,
    aliases: KIND_ALIASES,
    reliability: {
      cors: true,
      requestId: true,
      safeErrors: true,
      nodeRuntime: true,
      dynamic: true,
      maxDuration,
    },
    contract: {
      body: {
        prompt: "string",
        style: "optional style",
        format: "optional media/document format",
        duration: "optional video/audio duration",
        language: "optional code language",
        quality: "optional quality profile",
      },
      delegatedTo: "handleGenerateRequest(request, kind)",
    },
  }, { status: 200 }, id, kind)
}

export async function HEAD(request: Request, context: RouteContext) {
  const id = request.headers.get("X-Malik-Request-Id") || requestId()
  const kind = await readKind(context)
  return new Response(null, {
    status: SUPPORTED_KINDS.has(kind) ? 204 : 400,
    headers: {
      ...CORS_HEADERS,
      "X-Malik-Request-Id": id,
      "X-Malik-Route": `/api/generate/${kind}`,
      "X-Malik-Kind": kind,
      "X-Malik-Health": SUPPORTED_KINDS.has(kind) ? "ok" : "unsupported-kind",
    },
  })
}

export async function OPTIONS(request: Request, context: RouteContext) {
  const id = request.headers.get("X-Malik-Request-Id") || requestId()
  const kind = await readKind(context)
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "X-Malik-Request-Id": id,
      "X-Malik-Route": `/api/generate/${kind}`,
      "X-Malik-Kind": kind,
    },
  })
}
