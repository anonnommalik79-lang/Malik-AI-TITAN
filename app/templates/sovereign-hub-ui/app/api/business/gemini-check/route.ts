import {
  GeminiEngineError,
  chainForKey,
  configuredGeminiModels,
  describeTrail,
  geminiBaseUrl,
  geminiKeys,
  geminiLabel,
  runGemini,
} from "@/lib/business/gemini-engine"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Is Gemini actually answering for Autonomous Company?
 *
 *   GET /api/business/gemini-check          which keys exist and which models
 *                                           each key can see (free: ListModels)
 *   GET /api/business/gemini-check?live=1   plus one real, tiny answer
 *
 * Tests in the repository prove our side of the wire. Only the server that
 * holds the keys can prove that Google accepts them, so this runs there and
 * says the result in words. Key values never leave the server; the owner sees
 * the names of the variables they came from, everyone else sees only whether
 * the section works and on which model.
 *
 * The live answer spends a request, so it is held for a minute and served to
 * anyone who asks again meanwhile.
 */

type KeyReport = { source: string; listed: boolean; models: string[]; status?: number; detail?: string }
type LiveReport = { ok: boolean; model?: string; label?: string; ms?: number; reply?: string; error?: string; code?: string; trail?: string[] }

type CheckGlobal = typeof globalThis & { __malikBusinessGeminiLive?: { at: number; result: LiveReport } }

const HOLD_MS = 60_000

async function inspectKey(base: string, source: string, key: string): Promise<KeyReport> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`${base}/v1beta/models?pageSize=1000`, {
      headers: { "x-goog-api-key": key },
      signal: controller.signal,
      cache: "no-store",
    })
    const payload = await response.json().catch(() => ({})) as any
    if (!response.ok) {
      return {
        source,
        listed: false,
        models: [],
        status: response.status,
        detail: String(payload?.error?.message || `HTTP ${response.status}`).replace(/AIza[0-9A-Za-z_\-]{10,}/g, "[key]").slice(0, 200),
      }
    }
    const visible = new Set<string>(
      (Array.isArray(payload?.models) ? payload.models : [])
        .filter((item: any) => !item?.supportedGenerationMethods || item.supportedGenerationMethods.includes("generateContent"))
        .map((item: any) => String(item?.name || "").replace(/^models\//, ""))
        .filter(Boolean),
    )
    return { source, listed: true, models: chainForKey(configuredGeminiModels(), visible.size ? visible : null).slice(0, 6) }
  } catch (error) {
    return { source, listed: false, models: [], detail: error instanceof Error ? error.message.slice(0, 160) : "network error" }
  } finally {
    clearTimeout(timer)
  }
}

async function liveCheck(): Promise<LiveReport> {
  const store = globalThis as CheckGlobal
  const held = store.__malikBusinessGeminiLive
  if (held && Date.now() - held.at < HOLD_MS) return held.result
  const started = Date.now()
  let result: LiveReport
  try {
    const answer = await runGemini({
      system: "Ты проверка связи. Отвечай одним словом.",
      prompt: "Ответь одним словом по-русски: готово.",
      maxOutputTokens: 2_048,
      deadlineMs: 45_000,
      stallMs: { firstMs: 30_000, nextMs: 20_000 },
    })
    result = { ok: true, model: answer.model, label: geminiLabel(answer.model), ms: Date.now() - started, reply: answer.content.slice(0, 60) }
  } catch (error) {
    const failure = error instanceof GeminiEngineError ? error : null
    result = {
      ok: false,
      ms: Date.now() - started,
      code: failure?.code || "UNAVAILABLE",
      error: failure?.message || (error instanceof Error ? error.message : "Gemini не ответил"),
      trail: failure ? describeTrail(failure.trail) : undefined,
    }
  }
  store.__malikBusinessGeminiLive = { at: Date.now(), result }
  return result
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const entitlement = await resolveRequestEntitlement(request)
  const owner = entitlement.plan === "owner"
  const keys = geminiKeys()
  const base = geminiBaseUrl()

  if (!keys.length) {
    return Response.json({
      ok: false,
      configured: false,
      summary: owner
        ? "На сервере нет ключа Gemini. Добавь GEMINI_API_KEY или GOOGLE_AI_POOL_API_KEY в Environment на Render."
        : "Gemini не подключён.",
    }, { headers: { "cache-control": "no-store" } })
  }

  const reports = await Promise.all(keys.map((key) => inspectKey(base, key.source, key.key)))
  const best = reports.find((report) => report.listed && report.models.length)
  const live = url.searchParams.get("live") === "1" ? await liveCheck() : undefined
  const ok = live ? live.ok : Boolean(best)
  const model = live?.model || best?.models[0] || configuredGeminiModels()[0]

  const summary = live
    ? live.ok
      ? `Gemini отвечает: ${live.label}, ${((live.ms || 0) / 1000).toFixed(1)} с.`
      : `Gemini не ответил: ${live.error}`
    : best
      ? `Gemini подключён: ${geminiLabel(best.models[0])}.`
      : "Ключи есть, но Google не показал ни одной модели — проверь ключи."

  return Response.json({
    ok,
    configured: true,
    model,
    label: geminiLabel(model),
    models: best?.models || configuredGeminiModels(),
    summary,
    ...(live ? { live: owner ? live : { ok: live.ok, label: live.label, ms: live.ms } } : {}),
    ...(owner ? { keys: reports } : { keys: reports.length }),
  }, { headers: { "cache-control": "no-store" } })
}
