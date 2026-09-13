import { handleGenerateRequest } from "@/lib/generation-route"
import { handleMalikPhotoGenerationRequest } from "@/lib/media/generate-photo-route"
import { handleSkillWebsiteGenerationRequest } from "@/lib/sites/generate-site-route"
import { isFeatureDisabled } from "@/lib/server/request-safety"
import {
  acquireVideoDailySlot,
  getVideoDailyGateStatus,
  photoMaintenanceResponse,
  videoDailyLimitResponse,
} from "@/lib/server/media-availability"

import { withCompute } from "@/lib/malik-compute/runtime"
import { generationComputeOperation } from "@/lib/malik-compute/policies"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type RouteContext = { params: Promise<{ kind: string }> }

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

function disabledKind(kind: string, id: string) {
  return json({
    ok: false,
    publicError: "generation_temporarily_disabled",
    message: "This Malik AI generation capability is temporarily paused.",
    kind,
    requestId: id,
  }, {
    status: 503,
    headers: { "Retry-After": "60", "Cache-Control": "no-store" },
  }, id, kind)
}

async function bodyPrompt(request: Request) {
  const body = await request.clone().json().catch(() => ({})) as { prompt?: unknown; message?: unknown; input?: unknown }
  return String(body.prompt || body.message || body.input || "").trim()
}

function isExplicitVideoPrompt(prompt: string) {
  return /^\s*\/(?:video|veo)(?![\p{L}\p{N}_])\s*:?/iu.test(prompt)
}

export const POST = withCompute(handlePOST, generationComputeOperation)

async function handlePOST(request: Request, context: RouteContext) {
  const id = request.headers.get("X-Malik-Request-Id") || requestId()
  const kind = await readKind(context)

  if (!SUPPORTED_KINDS.has(kind)) return invalidKind(kind, id)
  if (isFeatureDisabled("generation") || isFeatureDisabled(kind)) return disabledKind(kind, id)

  if (kind === "photo") {
    return withCors(photoMaintenanceResponse(`/api/generate/${kind}`), kind, id)
  }

  if (kind === "video") {
    const prompt = await bodyPrompt(request)
    // generation-route only spends provider quota on explicit /video or /veo requests.
    // Keep invalid/text-routed requests from burning the single global slot.
    if (prompt && isExplicitVideoPrompt(prompt)) {
      const slot = await acquireVideoDailySlot("generate-kind")
      if (!slot.available) return withCors(videoDailyLimitResponse(slot, `/api/generate/${kind}`), kind, id)
    }
  }

  try {
    const startedAt = Date.now()
    const response = kind === "photo"
      ? await handleMalikPhotoGenerationRequest(request)
      : kind === "website"
        ? await handleSkillWebsiteGenerationRequest(request)
        : await handleGenerateRequest(request, kind)
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

  if (kind === "photo") {
    const response = photoMaintenanceResponse(`/api/generate/${kind}`)
    return withCors(response, kind, id)
  }

  if (kind === "video") {
    const gate = await getVideoDailyGateStatus()
    return json({
      ok: gate.available,
      product: "MALIK AI 6.5 TITAN",
      route: `/api/generate/${kind}`,
      method: "POST",
      runtime,
      kind,
      status: gate.available ? "ready" : "limited",
      tier: gate.available ? "Free" : "Pro",
      pro: !gate.available,
      locked: !gate.available,
      globalDailyLimit: 1,
      remainingDailyVideos: gate.available ? 1 : 0,
      resetAt: gate.resetAt,
      retryAt: gate.resetAt,
      storage: gate.storage,
      message: gate.available
        ? "MalikVideo доступен: осталась 1 бесплатная генерация для всех на текущий день."
        : "Бесплатный дневной лимит MalikVideo уже использован. Модель временно доступна как Pro до обновления лимита.",
    }, { status: 200, headers: { "Cache-Control": "no-store" } }, id, kind)
  }

  const paused = isFeatureDisabled("generation") || isFeatureDisabled(kind)
  return json({
    ok: !paused,
    product: "MALIK AI 6.5 TITAN",
    route: `/api/generate/${kind}`,
    method: "POST",
    runtime,
    kind,
    status: paused ? "paused" : "ready",
    explicitKindRouting: true,
    aliases: KIND_ALIASES,
    reliability: {
      cors: true,
      requestId: true,
      safeErrors: true,
      emergencyKillSwitch: true,
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
        modelId: "optional Malik image model id for photo generation",
      },
      delegatedTo: kind === "photo"
        ? "photo-maintenance"
        : kind === "website"
          ? "handleSkillWebsiteGenerationRequest(request)"
          : "handleGenerateRequest(request, kind)",
    },
  }, { status: paused ? 503 : 200 }, id, kind)
}

export async function HEAD(request: Request, context: RouteContext) {
  const id = request.headers.get("X-Malik-Request-Id") || requestId()
  const kind = await readKind(context)
  const supported = SUPPORTED_KINDS.has(kind)

  if (supported && kind === "photo") {
    return new Response(null, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "X-Malik-Request-Id": id,
        "X-Malik-Route": `/api/generate/${kind}`,
        "X-Malik-Kind": kind,
        "X-Malik-Health": "paused",
      },
    })
  }

  if (supported && kind === "video") {
    const gate = await getVideoDailyGateStatus()
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "X-Malik-Request-Id": id,
        "X-Malik-Route": `/api/generate/${kind}`,
        "X-Malik-Kind": kind,
        "X-Malik-Health": gate.available ? "ok" : "limited",
        "X-Malik-Video-Tier": gate.available ? "Free" : "Pro",
        "X-Malik-Video-Reset-At": gate.resetAt,
      },
    })
  }

  const paused = supported && (isFeatureDisabled("generation") || isFeatureDisabled(kind))
  return new Response(null, {
    status: !supported ? 400 : paused ? 503 : 204,
    headers: {
      ...CORS_HEADERS,
      "X-Malik-Request-Id": id,
      "X-Malik-Route": `/api/generate/${kind}`,
      "X-Malik-Kind": kind,
      "X-Malik-Health": !supported ? "unsupported-kind" : paused ? "paused" : "ok",
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
