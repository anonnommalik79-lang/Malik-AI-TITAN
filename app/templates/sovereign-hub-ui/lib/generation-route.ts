import { routeAI } from "@/lib/ai/router"
import { generateImageWithRouter, generateVideoWithRouter } from "@/lib/ai/media-router"
import { publicEngineForProvider, publicErrorMessage } from "@/lib/brand-provider-map"
import { checkRateLimit } from "@/lib/ai/rate-limit"
import { incrementUsage } from "@/lib/ai/usage"
import { createAIJob, updateAIJob, type AIJobInput } from "@/lib/ai/jobs"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import type { AIPlan } from "@/lib/ai/types"

type GenerationBody = {
  kind?: string
  prompt?: string
  message?: string
  style?: string
  format?: string
  aspectRatio?: string
  duration?: number
  userEmail?: string
  provider?: string
  engine?: string
  model?: string
  template?: string
  quality?: string
  safeMode?: boolean
  language?: string
  context?: string
  options?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

type GenerationKind =
  | "photo"
  | "video"
  | "code"
  | "website"
  | "landing"
  | "dashboard"
  | "document"
  | "presentation"
  | "template"
  | "component"
  | "audio"
  | "text"

type GenerationStage = "accepted" | "ready" | "demo-ready" | "queued" | "storyboard-ready" | "limited" | "invalid" | "unsupported" | "failed"

type GenerationEntitlement = Awaited<ReturnType<typeof resolveRequestEntitlement>>

type RequestContext = {
  requestId: string
  startedAt: number
  entitlement: GenerationEntitlement
  requestedKind: string
  kind: GenerationKind
  requestedProvider: string
  promptTruncated: boolean
  userAgent: string
  ipHint: string
  signal: AbortSignal
}

type ResponseOptions = {
  status?: number
  headers?: HeadersInit
}

type LocalVideoJob = ReturnType<typeof createAIJob> | { id: string }

const MAX_PROMPT_CHARS = 12_000
const MAX_TITLE_CHARS = 90
const DEFAULT_PROVIDER = "auto"
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Malik-Runtime": "generation-core-titan",
  "X-Malik-Contract": "2026-06-04",
} as const

const SUPPORTED_KINDS = new Set<GenerationKind>([
  "photo",
  "video",
  "code",
  "website",
  "landing",
  "dashboard",
  "document",
  "presentation",
  "template",
  "component",
  "audio",
  "text",
])

const KIND_ALIASES = new Map<string, GenerationKind>([
  ["image", "photo"],
  ["img", "photo"],
  ["picture", "photo"],
  ["photo-generation", "photo"],
  ["video-generation", "video"],
  ["website-generation", "website"],
  ["site", "website"],
  ["web", "website"],
  ["page", "website"],
  ["landing-page", "landing"],
  ["landing-generation", "landing"],
  ["dashboard-generation", "dashboard"],
  ["code-generation", "code"],
  ["tsx", "code"],
  ["react", "code"],
  ["component-generation", "component"],
  ["ui-component", "component"],
  ["doc", "document"],
  ["docs", "document"],
  ["document-generation", "document"],
  ["slides", "presentation"],
  ["deck", "presentation"],
  ["pitch-deck", "presentation"],
  ["presentation-generation", "presentation"],
  ["template-generation", "template"],
  ["templates", "template"],
  ["voice", "audio"],
  ["sound", "audio"],
  ["speech", "audio"],
  ["chat", "text"],
  ["copy", "text"],
])

const WEBSITE_LIKE_KINDS = new Set<GenerationKind>(["website", "landing", "dashboard", "template", "component"])
const TEXT_LIKE_KINDS = new Set<GenerationKind>(["document", "presentation", "audio", "text"])

const VIDEO_ASPECT_RATIOS: Array<NonNullable<AIJobInput["aspectRatio"]>> = ["1:1", "16:9", "9:16", "4:3", "3:4"]

function nowIso() {
  return new Date().toISOString()
}

function randomId(prefix = "req") {
  try {
    return `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }
}

function escapeHtml(value: string) {
  return String(value || "").replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[char] || char)
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, "&#039;")
}

function toPlainText(value: unknown) {
  return String(value || "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 || code === 9 || code === 10 || code === 13
    })
    .join("")
    .trim()
}

function compactText(value: string, limit = 160) {
  const clean = toPlainText(value).replace(/\s+/g, " ")
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean
}

function normalizeProvider(value: unknown) {
  const clean = String(value || DEFAULT_PROVIDER).trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, "")
  return clean || DEFAULT_PROVIDER
}

function normalizeKind(value: unknown): GenerationKind | null {
  const raw = String(value || "code").trim().toLowerCase().replace(/_/g, "-")
  const canonical = KIND_ALIASES.get(raw) || raw
  return SUPPORTED_KINDS.has(canonical as GenerationKind) ? canonical as GenerationKind : null
}

function normalizePrompt(raw: unknown) {
  const clean = toPlainText(raw)
  return {
    prompt: clean.slice(0, MAX_PROMPT_CHARS),
    truncated: clean.length > MAX_PROMPT_CHARS,
  }
}

function artifactId(kind: string) {
  return `malik_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function titleFromPrompt(prompt: string, fallback: string) {
  return compactText(prompt, MAX_TITLE_CHARS) || fallback
}

async function readGenerationBody(request: Request): Promise<GenerationBody> {
  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null)
    if (!form) return {}
    const body: GenerationBody = {}
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        ;(body as Record<string, unknown>)[key] = value
      }
    }
    return body
  }

  const raw = await request.text().catch(() => "")
  if (!raw.trim()) return {}

  try {
    return JSON.parse(raw) as GenerationBody
  } catch {
    return { prompt: raw }
  }
}

function responseJson(ctx: RequestContext | null, payload: Record<string, unknown>, options: ResponseOptions = {}) {
  const latencyMs = ctx ? Math.max(0, Date.now() - ctx.startedAt) : undefined
  const headers = new Headers({ ...PUBLIC_CACHE_HEADERS, ...(options.headers || {}) })
  if (ctx?.requestId) headers.set("X-Malik-Request-Id", ctx.requestId)
  if (ctx?.kind) headers.set("X-Malik-Kind", ctx.kind)
  if (typeof latencyMs === "number") headers.set("X-Malik-Latency-Ms", String(latencyMs))

  return Response.json(
    {
      ...payload,
      requestId: ctx?.requestId,
      latencyMs,
      generatedAt: nowIso(),
    },
    {
      status: options.status || 200,
      headers,
    },
  )
}

function errorJson(ctx: RequestContext | null, status: number, stage: GenerationStage, error: string, message: string, extra: Record<string, unknown> = {}) {
  return responseJson(
    ctx,
    {
      ok: false,
      kind: ctx?.kind,
      requestedKind: ctx?.requestedKind,
      status: stage,
      error,
      message,
      ...extra,
    },
    { status },
  )
}

async function resolveSafeEntitlement(request: Request, body: GenerationBody): Promise<GenerationEntitlement> {
  try {
    return await resolveRequestEntitlement(request)
  } catch {
    return {
      userId: toPlainText(body.userEmail) || "anonymous",
      plan: "free",
    } as GenerationEntitlement
  }
}

async function createRequestContext(request: Request, routeKind?: string) {
  const body = await readGenerationBody(request)
  const requestedKind = String(routeKind || body.kind || "code")
  const kind = normalizeKind(requestedKind)
  const promptState = normalizePrompt(body.prompt || body.message || "")
  const requestedProvider = normalizeProvider(body.provider || body.engine || request.headers.get("x-malik-provider"))
  const entitlement = await resolveSafeEntitlement(request, body)

  return {
    body,
    ctx: kind
      ? {
          requestId: request.headers.get("x-request-id") || request.headers.get("x-malik-request-id") || randomId("gen"),
          startedAt: Date.now(),
          entitlement,
          requestedKind,
          kind,
          requestedProvider,
          promptTruncated: promptState.truncated,
          userAgent: request.headers.get("user-agent") || "unknown",
          ipHint: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown",
          signal: request.signal,
        }
      : null,
    prompt: promptState.prompt,
  }
}

function publicDiagnostics(ctx: RequestContext, metadata: Record<string, unknown> = {}) {
  return {
    provider: "white-label",
    requestedProvider: ctx.requestedProvider,
    plan: String((ctx.entitlement as any).plan || "free"),
    promptTruncated: ctx.promptTruncated,
    route: "generation-core",
    ...metadata,
  }
}

function responseArtifact(kind: GenerationKind, prompt: string, code?: string, url?: string, extra: Record<string, unknown> = {}) {
  return {
    id: artifactId(kind),
    title: titleFromPrompt(prompt, `Malik AI ${kind}`),
    kind,
    code,
    html: kind === "code" ? undefined : code,
    url,
    createdAt: nowIso(),
    source: "malik-generation-core",
    ...extra,
  }
}

function outputRecord(output: unknown): Record<string, unknown> {
  return output && typeof output === "object" ? output as Record<string, unknown> : {}
}

function outputUrl(output: unknown): string {
  if (!output) return ""
  if (typeof output === "string") return output.startsWith("http") || output.startsWith("data:") || output.startsWith("/") ? output : ""
  if (typeof output !== "object") return ""

  const record = output as Record<string, unknown>
  const directKeys = ["resultUrl", "url", "imageUrl", "videoUrl", "mediaUrl", "outputUrl", "assetUrl", "signedUrl"]
  for (const key of directKeys) {
    const value = record[key]
    if (typeof value === "string" && (value.startsWith("http") || value.startsWith("data:") || value.startsWith("/"))) return value
  }

  const arrays = [record.output, record.outputs, record.images, record.videos, record.files, record.assets]
  for (const item of arrays) {
    if (!Array.isArray(item)) continue
    for (const nested of item) {
      const found = outputUrl(nested)
      if (found) return found
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = outputUrl(value)
      if (found) return found
    }
  }

  return ""
}

function videoAspectRatio(value: unknown): NonNullable<AIJobInput["aspectRatio"]> {
  const normalized = String(value || "16:9")
  return VIDEO_ASPECT_RATIOS.includes(normalized as NonNullable<AIJobInput["aspectRatio"]>)
    ? normalized as NonNullable<AIJobInput["aspectRatio"]>
    : "16:9"
}

function videoDuration(value: unknown): NonNullable<AIJobInput["duration"]> {
  const numeric = Number(value || 5)
  if (numeric <= 5) return 5
  if (numeric <= 8) return 8
  if (numeric <= 10) return 10
  return 12
}

function localVideoStatusUrl(jobId: string) {
  return `/api/ai/video/status?jobId=${encodeURIComponent(jobId)}`
}

function safeIncrementUsage(userId: string, plan: string, task: "image" | "video") {
  try {
    incrementUsage(userId, plan as AIPlan, task)
  } catch {
    // Usage accounting must never break the generation contract.
  }
}

function safeCheckRate(ctx: RequestContext, task: "image" | "video") {
  try {
    return checkRateLimit({ userId: ctx.entitlement.userId, plan: ctx.entitlement.plan, task })
  } catch {
    return { ok: true, message: "Rate limiter unavailable; request allowed by fallback policy." }
  }
}

function safeCreateVideoJob(ctx: RequestContext, prompt: string, metadata: Record<string, unknown>): LocalVideoJob {
  try {
    return createAIJob("video", {
      prompt,
      userId: ctx.entitlement.userId,
      userEmail: ctx.entitlement.userId,
      provider: ctx.requestedProvider,
      aspectRatio: metadata.aspectRatio as NonNullable<AIJobInput["aspectRatio"]>,
      duration: metadata.duration as NonNullable<AIJobInput["duration"]>,
      metadata,
    })
  } catch {
    return { id: randomId("video_job") }
  }
}

function safeUpdateVideoJob(jobId: string, patch: Parameters<typeof updateAIJob>[1]) {
  try {
    updateAIJob(jobId, patch)
  } catch {
    // Job persistence is best-effort. API response still returns a stable status URL.
  }
}

function imageFallbackUrl(prompt: string, style = "premium") {
  const safe = escapeHtml((prompt || "Malik AI image").slice(0, 140))
  const safeStyle = escapeHtml(style || "premium")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1344" height="768" viewBox="0 0 1344 768"><defs><radialGradient id="g" cx="24%" cy="18%" r="92%"><stop stop-color="#22d3ee"/><stop offset=".28" stop-color="#7c3aed"/><stop offset=".62" stop-color="#0f172a"/><stop offset="1" stop-color="#020617"/></radialGradient><linearGradient id="l" x1="0" x2="1"><stop stop-color="#67e8f9"/><stop offset=".52" stop-color="#ffffff"/><stop offset="1" stop-color="#d8b4fe"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="34"/></filter></defs><rect width="1344" height="768" fill="url(#g)"/><circle cx="1110" cy="142" r="230" fill="#22d3ee" opacity=".18" filter="url(#blur)"/><circle cx="188" cy="670" r="270" fill="#a855f7" opacity=".20" filter="url(#blur)"/><path d="M0 600 C220 520 415 692 680 590 C930 492 1110 618 1344 520 L1344 768 L0 768Z" fill="#020617" opacity=".72"/><rect x="72" y="62" width="1200" height="644" rx="58" fill="#020617" opacity=".58" stroke="url(#l)" stroke-width="2"/><text x="116" y="148" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900">Malik Vision Titan</text><text x="116" y="198" fill="#67e8f9" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800">${safeStyle} · demo-safe render</text><foreignObject x="116" y="498" width="1060" height="140"><div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:900;line-height:1.1;">${safe}</div></foreignObject></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function htmlShell(title: string, subtitle: string, kind: GenerationKind, body: string) {
  const safeTitle = escapeHtml(title)
  const safeSubtitle = escapeHtml(subtitle)
  const safeKind = escapeHtml(kind)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #020308; color: white; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .shell { min-height: 100vh; overflow: hidden; background: radial-gradient(circle at 14% 12%, rgba(34,211,238,.20), transparent 34%), radial-gradient(circle at 86% 18%, rgba(168,85,247,.24), transparent 36%), radial-gradient(circle at 50% 112%, rgba(37,99,235,.18), transparent 42%), linear-gradient(135deg, #020308, #050816 54%, #12051f); }
    .noise { position: fixed; inset: 0; pointer-events: none; opacity: .16; background-image: radial-gradient(circle at 20% 30%, rgba(255,255,255,.12) 0 1px, transparent 1.4px); background-size: 22px 22px; mix-blend-mode: overlay; }
    .wrap { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 54px 0 70px; }
    .nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 66px; }
    .logo { display: inline-flex; align-items: center; gap: 12px; font-weight: 950; letter-spacing: -.03em; }
    .logo-mark { width: 44px; height: 44px; border-radius: 16px; background: white; color: #020308; display: grid; place-items: center; box-shadow: 0 0 60px rgba(125,211,252,.24); }
    .pill { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.055); backdrop-filter: blur(20px); border-radius: 999px; padding: 10px 14px; color: rgba(255,255,255,.72); font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: .18em; }
    .hero { display: grid; gap: 32px; grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr); align-items: center; }
    .eyebrow { color: #67e8f9; font-size: 12px; font-weight: 950; letter-spacing: .26em; text-transform: uppercase; }
    h1 { margin: 18px 0 0; font-size: clamp(46px, 7vw, 92px); line-height: .88; letter-spacing: -.075em; }
    .grad { background: linear-gradient(90deg, #67e8f9, #ffffff 42%, #d8b4fe 86%); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .lead { margin-top: 24px; max-width: 700px; color: rgba(226,232,240,.76); font-size: clamp(16px, 1.7vw, 21px); line-height: 1.72; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; }
    .btn { border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 15px 20px; font-weight: 950; text-decoration: none; color: white; background: rgba(255,255,255,.06); }
    .btn.primary { background: white; color: #020308; }
    .card { border: 1px solid rgba(255,255,255,.11); background: linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.035)); border-radius: 34px; padding: 22px; box-shadow: 0 36px 140px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter: blur(24px); }
    .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 30px; }
    .metric { border: 1px solid rgba(255,255,255,.10); border-radius: 24px; padding: 18px; background: rgba(0,0,0,.22); }
    .metric span { display: block; color: rgba(226,232,240,.55); font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: .16em; }
    .metric strong { display: block; margin-top: 10px; font-size: 30px; letter-spacing: -.04em; }
    .window { overflow: hidden; border-radius: 30px; border: 1px solid rgba(255,255,255,.12); background: rgba(2,6,23,.74); }
    .window-top { display:flex; gap:8px; align-items:center; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,.28); }
    .bars { padding: 22px; display:grid; gap: 12px; }
    .bar { height: 48px; border-radius: 16px; background: linear-gradient(90deg, rgba(34,211,238,.16), rgba(168,85,247,.13)); border: 1px solid rgba(255,255,255,.08); }
    .bar:nth-child(2) { width: 82%; }
    .bar:nth-child(3) { width: 70%; }
    .content { margin-top: 36px; }
    @media (max-width: 860px) { .hero { grid-template-columns: 1fr; } .metric-grid { grid-template-columns: 1fr; } .nav { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <main class="shell">
    <div class="noise"></div>
    <div class="wrap">
      <nav class="nav">
        <div class="logo"><span class="logo-mark">M</span><span>Malik AI</span></div>
        <div class="pill">${safeKind} · production artifact</div>
      </nav>
      <section class="hero">
        <div>
          <p class="eyebrow">Sovereign generation core</p>
          <h1>${safeTitle}<br/><span class="grad">ready to ship</span></h1>
          <p class="lead">${safeSubtitle}</p>
          <div class="actions"><a class="btn primary">Launch Preview</a><a class="btn">Open Canvas</a><a class="btn">Export</a></div>
        </div>
        <aside class="card">
          <div class="window">
            <div class="window-top"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
            <div class="bars"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>
          </div>
          <div class="metric-grid"><div class="metric"><span>Quality</span><strong>99</strong></div><div class="metric"><span>Fallback</span><strong>On</strong></div><div class="metric"><span>Canvas</span><strong>Ready</strong></div></div>
        </aside>
      </section>
      <section class="content">${body}</section>
    </div>
  </main>
</body>
</html>`
}

function websiteArtifact(prompt: string, kind: GenerationKind) {
  const title = titleFromPrompt(prompt, `Malik AI ${kind}`)
  const body = `<div class="card"><p class="eyebrow">Generated brief</p><p class="lead">${escapeHtml(prompt || "Production-ready Malik AI artifact.")}</p><div class="metric-grid"><div class="metric"><span>Sections</span><strong>12</strong></div><div class="metric"><span>Responsive</span><strong>Yes</strong></div><div class="metric"><span>Demo</span><strong>Live</strong></div></div></div>`
  return htmlShell(title, `A premium ${kind} starter generated through Malik AI with safe fallback continuity.`, kind, body)
}

function documentArtifact(prompt: string, kind: GenerationKind) {
  const title = titleFromPrompt(prompt, kind === "presentation" ? "Investor presentation" : "Executive document")
  const sections = [
    ["Objective", "Define the business goal, audience, and expected outcome."],
    ["Core Strategy", "Turn the idea into a clear product, launch, and execution plan."],
    ["Architecture", "Map the modules, data flow, user journey, and operational risks."],
    ["Next Actions", "Ship the smallest impressive demo, then harden the production layer."],
  ]
    .map(([heading, text]) => `<article class="metric"><span>${escapeHtml(heading)}</span><p style="margin-top:10px;color:rgba(226,232,240,.78);line-height:1.7">${escapeHtml(text)}</p></article>`)
    .join("")
  return htmlShell(title, escapeHtml(prompt || "Structured artifact"), kind, `<div class="card"><div class="metric-grid">${sections}</div></div>`)
}

function presentationArtifact(prompt: string) {
  const title = titleFromPrompt(prompt, "Malik AI pitch deck")
  const slides = [
    ["01", "Problem", "Manual product creation is slow, fragmented, and expensive."],
    ["02", "Solution", "Malik AI unifies chat, code, media, canvas, and generation flows."],
    ["03", "Product", "A sovereign AI workspace for builders, founders, and teams."],
    ["04", "Demo", "Prompt to artifact: website, code, image, video, document, and pitch."],
    ["05", "Roadmap", "Stabilize core routes, launch pilots, then scale enterprise workflows."],
  ]
    .map(([n, h, t]) => `<article class="metric"><span>${n}</span><strong style="font-size:24px">${escapeHtml(h)}</strong><p style="color:rgba(226,232,240,.72);line-height:1.6">${escapeHtml(t)}</p></article>`)
    .join("")
  return htmlShell(title, escapeHtml(prompt || "Investor-ready pitch deck."), "presentation", `<div class="card"><div class="metric-grid">${slides}</div></div>`)
}

function videoStoryboardArtifact(prompt: string) {
  const frames = [
    ["00:00", "Hook", "Dark premium hero, product logo, fast cinematic reveal."],
    ["00:04", "Problem", "Fragmented workflow shown as split screens and broken tasks."],
    ["00:08", "Product", "Malik AI dashboard routes prompt into code, media, and canvas."],
    ["00:12", "Proof", "Live artifact appears with metrics, export, and safe fallback."],
    ["00:16", "Close", "Sovereign AI infrastructure from Kazakhstan to the world."],
  ]
    .map(([time, label, text]) => `<article class="metric"><span>${time}</span><strong style="font-size:24px">${escapeHtml(label)}</strong><p style="color:rgba(226,232,240,.72);line-height:1.6">${escapeHtml(text)}</p></article>`)
    .join("")
  return htmlShell(`Video storyboard: ${titleFromPrompt(prompt, "Malik AI")}`, "Fallback storyboard generated while live video rendering is being prepared.", "video", `<div class="card"><div class="metric-grid">${frames}</div></div>`)
}

function codeArtifact(prompt: string) {
  const safeTitle = escapeHtml(prompt || "Generated Malik AI feature")
  return `"use client"

import { useMemo } from "react"

const metrics = [
  { label: "Runtime", value: "Online", detail: "Fallback-safe generation core" },
  { label: "Canvas", value: "Ready", detail: "Artifact handoff enabled" },
  { label: "Quality", value: "Titan", detail: "Production UI contract" },
]

export default function MalikGeneratedFeature() {
  const title = useMemo(() => ${JSON.stringify(safeTitle)}, [])

  return (
    <main className="min-h-screen overflow-hidden bg-[#020308] p-6 text-white">
      <section className="mx-auto max-w-6xl rounded-[2rem] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-[0_40px_140px_rgba(0,0,0,.45)] backdrop-blur-2xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Malik AI Code Generator</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-black tracking-tight md:text-7xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">Generated production-ready feature shell with metrics, fallback state, and premium styling.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <article key={metric.label} className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <p className="text-sm text-slate-400">{metric.label}</p>
              <strong className="mt-2 block text-3xl">{metric.value}</strong>
              <span className="mt-2 block text-sm text-slate-500">{metric.detail}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
`
}

function fallbackArtifactFor(kind: GenerationKind, prompt: string) {
  if (kind === "code") return codeArtifact(prompt)
  if (kind === "presentation") return presentationArtifact(prompt)
  if (kind === "document" || kind === "text" || kind === "audio") return documentArtifact(prompt, kind)
  if (kind === "video") return videoStoryboardArtifact(prompt)
  return websiteArtifact(prompt, kind)
}

function textPrompt(kind: GenerationKind, prompt: string, body: GenerationBody) {
  const language = body.language ? `\nPreferred language/stack: ${body.language}.` : ""
  const quality = body.quality ? `\nQuality target: ${body.quality}.` : ""
  const safe = "Do not return secrets, raw provider names, private keys, or unsafe instructions. Return a complete usable artifact."

  if (kind === "code") {
    return `Create a production-ready code artifact for this request. Return complete code only when possible, with clean structure and no placeholder comments.${language}${quality}\n${safe}\n\nRequest:\n${prompt}`
  }

  if (kind === "component") {
    return `Create a premium React/TypeScript UI component with responsive Tailwind styling, loading/empty/error states, and clear props. Return complete code. ${safe}\n\nRequest:\n${prompt}`
  }

  if (kind === "document") {
    return `Create a polished executive document as a complete HTML artifact. Include summary, strategy, architecture, risks, milestones and next actions. ${safe}\n\nRequest:\n${prompt}`
  }

  if (kind === "presentation") {
    return `Create an investor-ready presentation as a complete HTML slide deck. Include slide titles, strong speaker notes, demo story, metrics placeholders, and final CTA. ${safe}\n\nRequest:\n${prompt}`
  }

  if (kind === "audio") {
    return `Create a professional audio/script artifact: voice direction, timing, emotions, scene beats, and final narration text. Return as complete HTML or Markdown. ${safe}\n\nRequest:\n${prompt}`
  }

  if (kind === "text") {
    return `Create a polished text artifact with structure, clarity, and action steps. ${safe}\n\nRequest:\n${prompt}`
  }

  return `Create a complete standalone HTML artifact for a ${kind}. It must be responsive, premium, investor-readable, production-styled, and ready for Canvas preview.${language}${quality}\n${safe}\n\nRequest:\n${prompt}`
}

function buildRouteMetadata(ctx: RequestContext, body: GenerationBody, extra: Record<string, unknown> = {}) {
  return {
    requestedProvider: ctx.requestedProvider,
    requestedKind: ctx.requestedKind,
    style: body.style,
    format: body.format,
    aspectRatio: body.aspectRatio,
    duration: body.duration,
    template: body.template,
    quality: body.quality,
    safeMode: body.safeMode !== false,
    options: body.options,
    route: "generation-route.ts",
    ...body.metadata,
    ...extra,
  }
}

async function handleImageGeneration(ctx: RequestContext, body: GenerationBody, prompt: string) {
  const makeImageFallback = (
    status: "demo-ready" | "preview-ready" = "preview-ready",
    reason?: unknown,
    rateLimited = false,
  ) => {
    const url = imageFallbackUrl(prompt, body.style || body.format || "premium")

    return responseJson(ctx, {
      ok: true,
      kind: ctx.kind,
      requestedKind: ctx.requestedKind,
      engine: publicEngineForProvider("demo-fallback", ctx.kind).title,
      provider: "demo-fallback",
      model: "image-preview",
      fallbackUsed: true,
      fallback: true,
      status,
      url,
      imageUrl: url,
      previewUrl: url,
      posterUrl: url,
      mediaUrl: url,
      outputUrl: url,
      assetUrl: url,
      artifact: responseArtifact(ctx.kind, prompt, undefined, url, {
        mediaType: "image",
        safeFallback: true,
        rateLimited,
      }),
      message: rateLimited
        ? "Demo image preview ready. Live image generation will work after provider limits reset."
        : "Demo image preview ready. Live rendering is being prepared on the server.",
      displayMessage: "Demo image preview ready.",
      publicError: reason ? publicErrorMessage(reason) : undefined,
      diagnostics: publicDiagnostics(ctx, {
        lane: "image",
        providerStatus: rateLimited ? "rate-limit-fallback" : "fallback",
      }),
    })
  }

  const rate = safeCheckRate(ctx, "image")

  // IMPORTANT:
  // Media generation must never show HTTP 429 in the product UI.
  // If live generation is limited, return a stable HTTP 200 demo preview.
  if (!rate.ok) {
    return makeImageFallback("preview-ready", rate.message || "limit_reached", true)
  }

  try {
    const result = await generateImageWithRouter({
      prompt,
      task: "image",
      provider: ctx.requestedProvider,
      userId: ctx.entitlement.userId,
      userEmail: ctx.entitlement.userId,
      plan: ctx.entitlement.plan,
      signal: ctx.signal,
      metadata: buildRouteMetadata(ctx, body, { lane: "image" }),
    })

    const url = outputUrl(result.output)

    // If provider succeeds but no media URL exists, show demo preview instead of error.
    if (!url) {
      return makeImageFallback("preview-ready", "Image provider returned no image URL.", false)
    }

    safeIncrementUsage(ctx.entitlement.userId, ctx.entitlement.plan, "image")

    return responseJson(ctx, {
      ok: true,
      kind: ctx.kind,
      requestedKind: ctx.requestedKind,
      engine: publicEngineForProvider(result.provider, ctx.kind).title,
      provider: result.provider,
      model: result.model,
      fallbackUsed: false,
      fallback: false,
      status: "ready",
      url,
      imageUrl: url,
      previewUrl: url,
      posterUrl: url,
      mediaUrl: url,
      outputUrl: url,
      assetUrl: url,
      artifact: responseArtifact(ctx.kind, prompt, undefined, url, { mediaType: "image" }),
      message: "Image generated.",
      displayMessage: "Image generated.",
      diagnostics: publicDiagnostics(ctx, { lane: "image", providerStatus: "live" }),
    })
  } catch (error) {
    safeIncrementUsage(ctx.entitlement.userId, ctx.entitlement.plan, "image")
    return makeImageFallback("preview-ready", error, false)
  }
}

async function handleVideoGeneration(ctx: RequestContext, body: GenerationBody, prompt: string) {
  const videoMetadata = buildRouteMetadata(ctx, body, {
    lane: "video",
    aspectRatio: videoAspectRatio(body.aspectRatio || body.format),
    duration: videoDuration(body.duration),
  })

  const localJob = safeCreateVideoJob(ctx, prompt, videoMetadata)

  const makeVideoFallback = (
    status: "storyboard-ready" | "preview-ready" = "storyboard-ready",
    reason?: unknown,
    rateLimited = false,
  ) => {
    const previewUrl = imageFallbackUrl(
      `Video storyboard preview: ${prompt}`,
      body.style || body.format || "cinematic",
    )
    const code = videoStoryboardArtifact(prompt)

    safeUpdateVideoJob(localJob.id, {
      status: "completed",
      output: {
        resultUrl: previewUrl,
        provider: "demo-fallback",
        model: "storyboard-preview",
        raw: {
          fallback: true,
          rateLimited,
          reason: reason ? publicErrorMessage(reason) : undefined,
        },
      },
    })

    return responseJson(ctx, {
      ok: true,
      kind: ctx.kind,
      requestedKind: ctx.requestedKind,
      engine: publicEngineForProvider("demo-fallback", ctx.kind).title,
      provider: "demo-fallback",
      model: "storyboard-preview",
      fallbackUsed: true,
      fallback: true,
      status,
      url: previewUrl,
      videoUrl: previewUrl,
      previewUrl,
      posterUrl: previewUrl,
      mediaUrl: previewUrl,
      outputUrl: previewUrl,
      assetUrl: previewUrl,
      code,
      html: code,
      storyboard: ["Hook", "Problem", "Product", "Proof", "Close"],
      jobId: localJob.id,
      statusUrl: localVideoStatusUrl(localJob.id),
      artifact: responseArtifact(ctx.kind, prompt, code, previewUrl, {
        mediaType: "storyboard",
        jobId: localJob.id,
        safeFallback: true,
        rateLimited,
      }),
      message: rateLimited
        ? "Demo video storyboard ready. Live video rendering will work after provider limits reset."
        : "Demo video storyboard ready. Live rendering is being prepared on the server.",
      displayMessage: "Demo video storyboard ready.",
      publicError: reason ? publicErrorMessage(reason) : undefined,
      diagnostics: publicDiagnostics(ctx, {
        lane: "video",
        providerStatus: rateLimited ? "rate-limit-fallback" : "fallback",
      }),
    })
  }

  const rate = safeCheckRate(ctx, "video")

  // IMPORTANT:
  // Media generation must never show HTTP 429 in the product UI.
  // If live generation is limited, return a stable HTTP 200 storyboard preview.
  if (!rate.ok) {
    return makeVideoFallback("storyboard-ready", rate.message || "limit_reached", true)
  }

  try {
    const result = await generateVideoWithRouter({
      prompt,
      task: "video",
      provider: ctx.requestedProvider,
      userId: ctx.entitlement.userId,
      userEmail: ctx.entitlement.userId,
      plan: ctx.entitlement.plan,
      signal: ctx.signal,
      metadata: videoMetadata,
    })

    const url = outputUrl(result.output)
    const output = outputRecord(result.output)
    const providerJobId = String(output.jobId || output.id || "")
    const status = String(output.status || (url ? "ready" : "queued"))

    // If provider succeeds but no URL/job id exists, show storyboard instead of error.
    if (!url && !providerJobId) {
      return makeVideoFallback("storyboard-ready", "Video provider returned no URL or job id.", false)
    }

    safeUpdateVideoJob(localJob.id, {
      status: url ? "completed" : "processing",
      provider: result.provider,
      model: result.model,
      output: {
        resultUrl: url || undefined,
        provider: result.provider,
        model: result.model,
        raw: {
          ...output,
          provider: result.provider,
          model: result.model,
          providerJobId: providerJobId || undefined,
        },
      },
    })

    safeIncrementUsage(ctx.entitlement.userId, ctx.entitlement.plan, "video")

    return responseJson(ctx, {
      ok: true,
      kind: ctx.kind,
      requestedKind: ctx.requestedKind,
      engine: publicEngineForProvider(result.provider, ctx.kind).title,
      provider: result.provider,
      model: result.model,
      fallbackUsed: false,
      fallback: false,
      status,
      url: url || undefined,
      videoUrl: url || undefined,
      previewUrl: url || undefined,
      posterUrl: url || undefined,
      mediaUrl: url || undefined,
      outputUrl: url || undefined,
      assetUrl: url || undefined,
      jobId: localJob.id,
      providerJobId: providerJobId || undefined,
      statusUrl: localVideoStatusUrl(localJob.id),
      artifact: responseArtifact(ctx.kind, prompt, undefined, url || undefined, {
        mediaType: "video",
        jobId: localJob.id,
      }),
      message: url ? "Video generated." : "Video render queued.",
      displayMessage: url ? "Video generated." : "Video render queued.",
      diagnostics: publicDiagnostics(ctx, {
        lane: "video",
        providerStatus: url ? "ready" : "queued",
      }),
    })
  } catch (error) {
    safeIncrementUsage(ctx.entitlement.userId, ctx.entitlement.plan, "video")
    return makeVideoFallback("storyboard-ready", error, false)
  }
}

async function handleTextOrArtifactGeneration(ctx: RequestContext, body: GenerationBody, prompt: string) {
  const fallbackCode = fallbackArtifactFor(ctx.kind, prompt)
  const task = ctx.kind === "code" || ctx.kind === "component" ? "code" : "project"

  try {
    const result = await routeAI({
      prompt: textPrompt(ctx.kind, prompt, body),
      task,
      provider: ctx.requestedProvider,
      userEmail: ctx.entitlement.userId,
      userId: ctx.entitlement.userId,
      plan: ctx.entitlement.plan,
      signal: ctx.signal,
      metadata: buildRouteMetadata(ctx, body, { lane: task }),
    })

    const rawOutput = typeof result.output === "string" ? result.output.trim() : ""
    const code = result.success && rawOutput ? rawOutput : fallbackCode
    const fallback = !result.success || !rawOutput

    return responseJson(ctx, {
      ok: true,
      kind: ctx.kind,
      requestedKind: ctx.requestedKind,
      engine: publicEngineForProvider(fallback ? "demo-fallback" : result.provider, ctx.kind).title,
      status: fallback ? "demo-ready" : "ready",
      code,
      html: ctx.kind === "code" ? undefined : code,
      text: TEXT_LIKE_KINDS.has(ctx.kind) ? code : undefined,
      fallback,
      fallbackUsed: fallback || Boolean(result.fallbackUsed),
      artifact: responseArtifact(ctx.kind, prompt, code, undefined, { task, safeFallback: fallback }),
      message: fallback ? "Demo artifact ready. Live generation is being prepared on the server." : "Artifact generated.",
      publicError: fallback ? publicErrorMessage(result.error) : undefined,
      diagnostics: publicDiagnostics(ctx, { lane: task, providerStatus: fallback ? "fallback" : "live" }),
    })
  } catch (error) {
    return responseJson(ctx, {
      ok: true,
      kind: ctx.kind,
      requestedKind: ctx.requestedKind,
      engine: publicEngineForProvider("demo-fallback", ctx.kind).title,
      status: "demo-ready",
      code: fallbackCode,
      html: ctx.kind === "code" ? undefined : fallbackCode,
      text: TEXT_LIKE_KINDS.has(ctx.kind) ? fallbackCode : undefined,
      fallback: true,
      fallbackUsed: true,
      artifact: responseArtifact(ctx.kind, prompt, fallbackCode, undefined, { task, safeFallback: true }),
      message: "Demo artifact ready. Live generation is being prepared on the server.",
      publicError: publicErrorMessage(error),
      diagnostics: publicDiagnostics(ctx, { lane: task, providerStatus: "fallback" }),
    })
  }
}

export function generationManifest() {
  return {
    ok: true,
    name: "MALIK AI Generation Core",
    version: "titan-2026-06-04",
    contract: "stable-json-artifact-v1",
    kinds: Array.from(SUPPORTED_KINDS),
    aliases: Object.fromEntries(KIND_ALIASES.entries()),
    media: ["photo", "video"],
    artifactKinds: Array.from(new Set([...WEBSITE_LIKE_KINDS, ...TEXT_LIKE_KINDS, "code"])),
    guarantees: [
      "no blank demo response",
      "white-label public engine names",
      "safe fallback artifacts",
      "stable request id",
      "Canvas-compatible artifact object",
      "job status URL for video",
    ],
  }
}

export async function handleGenerateRequest(request: Request, routeKind?: string) {
  const { body, ctx, prompt } = await createRequestContext(request, routeKind)

  if (!ctx) {
    return errorJson(null, 400, "unsupported", "unsupported_kind", `Unsupported generation kind: ${String(routeKind || body.kind || "unknown")}`, {
      supportedKinds: Array.from(SUPPORTED_KINDS),
      aliases: Object.fromEntries(KIND_ALIASES.entries()),
    })
  }

  if (!prompt) {
    return errorJson(ctx, 400, "invalid", "prompt_required", "Prompt is required.")
  }

  try {
    if (ctx.kind === "photo") {
      return await handleImageGeneration(ctx, body, prompt)
    }

    if (ctx.kind === "video") {
      return await handleVideoGeneration(ctx, body, prompt)
    }

    return await handleTextOrArtifactGeneration(ctx, body, prompt)
  } catch (error) {
    if (ctx.kind === "photo") {
      const url = imageFallbackUrl(prompt, body.style || body.format || "premium")

      return responseJson(ctx, {
        ok: true,
        kind: ctx.kind,
        requestedKind: ctx.requestedKind,
        engine: publicEngineForProvider("demo-fallback", ctx.kind).title,
        provider: "demo-fallback",
        model: "image-preview",
        status: "preview-ready",
        url,
        imageUrl: url,
        previewUrl: url,
        posterUrl: url,
        mediaUrl: url,
        outputUrl: url,
        assetUrl: url,
        fallback: true,
        fallbackUsed: true,
        artifact: responseArtifact(ctx.kind, prompt, undefined, url, {
          mediaType: "image",
          safeFallback: true,
          emergency: true,
        }),
        message: "Demo image preview ready. Live rendering is being prepared on the server.",
        displayMessage: "Demo image preview ready.",
        publicError: publicErrorMessage(error),
        diagnostics: publicDiagnostics(ctx, { providerStatus: "emergency-image-fallback" }),
      })
    }

    if (ctx.kind === "video") {
      const previewUrl = imageFallbackUrl(
        `Video storyboard preview: ${prompt}`,
        body.style || body.format || "cinematic",
      )
      const code = videoStoryboardArtifact(prompt)

      return responseJson(ctx, {
        ok: true,
        kind: ctx.kind,
        requestedKind: ctx.requestedKind,
        engine: publicEngineForProvider("demo-fallback", ctx.kind).title,
        provider: "demo-fallback",
        model: "storyboard-preview",
        status: "storyboard-ready",
        url: previewUrl,
        videoUrl: previewUrl,
        previewUrl,
        posterUrl: previewUrl,
        mediaUrl: previewUrl,
        outputUrl: previewUrl,
        assetUrl: previewUrl,
        code,
        html: code,
        storyboard: ["Hook", "Problem", "Product", "Proof", "Close"],
        fallback: true,
        fallbackUsed: true,
        artifact: responseArtifact(ctx.kind, prompt, code, previewUrl, {
          mediaType: "storyboard",
          safeFallback: true,
          emergency: true,
        }),
        message: "Demo video storyboard ready. Live rendering is being prepared on the server.",
        displayMessage: "Demo video storyboard ready.",
        publicError: publicErrorMessage(error),
        diagnostics: publicDiagnostics(ctx, { providerStatus: "emergency-video-fallback" }),
      })
    }

    const fallbackCode = fallbackArtifactFor(ctx.kind, prompt)

    return responseJson(ctx, {
      ok: true,
      kind: ctx.kind,
      requestedKind: ctx.requestedKind,
      engine: publicEngineForProvider("demo-fallback", ctx.kind).title,
      provider: "demo-fallback",
      model: "artifact-preview",
      status: "demo-ready",
      code: fallbackCode,
      html: ctx.kind === "code" ? undefined : fallbackCode,
      fallback: true,
      fallbackUsed: true,
      artifact: responseArtifact(ctx.kind, prompt, fallbackCode, undefined, {
        safeFallback: true,
        emergency: true,
      }),
      message: "Emergency fallback artifact ready. Live generation is being prepared on the server.",
      displayMessage: "Emergency fallback artifact ready.",
      publicError: publicErrorMessage(error),
      diagnostics: publicDiagnostics(ctx, { providerStatus: "emergency-fallback" }),
    })
  }
}
