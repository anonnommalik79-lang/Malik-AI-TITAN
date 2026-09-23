import { hasMalikProAccess } from "@/lib/ai/malik-models"
import {
  PRESENTATION_COSTS,
  clampSlideCount,
  detectDeckLanguage,
  normalizeOutline,
  normalizeSlide,
} from "@/lib/presentations/deck"
import type { DeckLanguage, DeckTone } from "@/lib/presentations/types"
import { isSlideLayout } from "@/lib/presentations/deck"
import {
  PresentationEngineError,
  SLIDE_BATCH_SIZE,
  generateOutline,
  generateSlides,
  rewriteSlide,
} from "@/lib/server/presentation-engine"
import {
  getPresentationQuota,
  refundPresentationCredits,
  reservePresentationCredits,
  type PresentationQuota,
} from "@/lib/server/presentation-quota"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { MalikModelRouteError, malikModelErrorPayload } from "@/lib/server/malik-model-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 256 * 1024
const MAX_TOPIC_CHARS = 4_000
/** Batches a single account may have running at once. The studio uses two. */
const MAX_PARALLEL = 3

const TONES: DeckTone[] = ["confident", "friendly", "academic", "bold"]

type InFlightGlobal = typeof globalThis & { __malikPresentationInFlight?: Map<string, number> }

function inFlight() {
  const scope = globalThis as InFlightGlobal
  if (!scope.__malikPresentationInFlight) scope.__malikPresentationInFlight = new Map()
  return scope.__malikPresentationInFlight
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store", "x-malik-router": "presentation-studio-v1" } })
}

function languageOf(value: unknown, sample: string): DeckLanguage {
  return value === "ru" || value === "kk" || value === "en" ? value : detectDeckLanguage(sample)
}

function toneOf(value: unknown): DeckTone {
  return TONES.includes(value as DeckTone) ? value as DeckTone : "confident"
}

/**
 * The studio's single server entry point.
 *
 * GET  → this account's credits for today.
 * POST → one of three jobs, each paid for in credits that are reserved before
 *        the model is called and refunded for anything that does not arrive:
 *
 *   { action: "outline", topic, count, language?, tone? }          costs 1
 *   { action: "slides",  topic, outline, startIndex, count, … }    costs 1 per slide delivered
 *   { action: "rewrite", deckTitle, slide, layout?, instruction? } costs 1
 *
 * Deliberately not wrapped in Malik Compute: credits are the meter here, and
 * charging a deck against the chat's 10 000-token daily budget as well would
 * let one presentation end a free user's day of chatting.
 */
export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  const quota = await getPresentationQuota(entitlement.userId, entitlement.plan, entitlement.authenticated)
  return json({ ok: true, authenticated: entitlement.authenticated, quota, batchSize: SLIDE_BATCH_SIZE })
}

export async function POST(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  const { userId, plan, authenticated } = entitlement
  const model = { allowCatalog: hasMalikProAccess(plan) }

  let body: Record<string, unknown>
  try {
    body = await readJsonBodyLimited<Record<string, unknown>>(request, MAX_BODY_BYTES)
  } catch (error) {
    if (error instanceof RequestSafetyError) return json({ ok: false, error: error.message }, error.status)
    return json({ ok: false, error: "Не удалось прочитать запрос." }, 400)
  }

  const action = String(body.action || "")
  if (!["outline", "slides", "rewrite"].includes(action)) {
    return json({ ok: false, error: "Неизвестное действие." }, 400)
  }

  const running = inFlight().get(userId) || 0
  if (running >= MAX_PARALLEL) {
    return json({ ok: false, code: "PRESENTATION_BUSY", error: "Презентация ещё собирается — дождитесь завершения." }, 429)
  }

  let reserved = 0
  let refund = async (_amount: number): Promise<PresentationQuota | null> => null

  inFlight().set(userId, running + 1)
  try {
    /* -------------------------------------------------------- outline */
    if (action === "outline") {
      const topic = String(body.topic || "").trim().slice(0, MAX_TOPIC_CHARS)
      if (topic.length < 3) return json({ ok: false, error: "Опишите, о чём презентация." }, 400)

      const quotaBefore = await getPresentationQuota(userId, plan, authenticated)
      const count = Math.min(clampSlideCount(body.count), quotaBefore.maxSlides)

      const reservation = await reservePresentationCredits(userId, plan, authenticated, PRESENTATION_COSTS.outline)
      if (!reservation.ok) return json({ ok: false, code: reservation.code, error: reservation.error, quota: reservation.quota }, reservation.status)
      reserved = PRESENTATION_COSTS.outline
      refund = (amount) => refundPresentationCredits(userId, plan, authenticated, amount)

      const outline = await generateOutline({
        ...model,
        topic,
        count,
        language: languageOf(body.language, topic),
        tone: toneOf(body.tone),
      })
      reserved = 0
      return json({ ok: true, outline, quota: reservation.quota })
    }

    /* --------------------------------------------------------- slides */
    if (action === "slides") {
      const topic = String(body.topic || "").trim().slice(0, MAX_TOPIC_CHARS)
      const quotaBefore = await getPresentationQuota(userId, plan, authenticated)
      const outline = normalizeOutline(body.outline, topic, quotaBefore.maxSlides)
      if (!outline) return json({ ok: false, error: "План презентации повреждён — составьте его заново." }, 400)

      const startIndex = Math.max(0, Math.floor(Number(body.startIndex) || 0))
      const count = Math.max(1, Math.min(SLIDE_BATCH_SIZE, Math.floor(Number(body.count) || SLIDE_BATCH_SIZE), outline.items.length - startIndex))
      if (startIndex >= outline.items.length || count < 1) return json({ ok: false, error: "В плане нет таких слайдов." }, 400)

      const reservation = await reservePresentationCredits(userId, plan, authenticated, count * PRESENTATION_COSTS.slide)
      if (!reservation.ok) return json({ ok: false, code: reservation.code, error: reservation.error, quota: reservation.quota }, reservation.status)
      reserved = count * PRESENTATION_COSTS.slide
      refund = (amount) => refundPresentationCredits(userId, plan, authenticated, amount)

      const result = await generateSlides({
        ...model,
        topic: topic || outline.title,
        outline,
        startIndex,
        count,
        language: languageOf(body.language, `${topic} ${outline.title}`),
        tone: toneOf(body.tone),
      })

      // Paid only for what arrived.
      let quota = reservation.quota
      const undelivered = result.missing.length * PRESENTATION_COSTS.slide
      if (undelivered) quota = (await refund(undelivered)) || quota
      reserved = 0

      if (!result.slides.length) {
        return json({ ok: false, code: "SLIDES_FAILED", error: "Модель не вернула слайды. Кредиты не списаны — попробуйте ещё раз.", quota }, 502)
      }
      return json({ ok: true, slides: result.slides, missing: result.missing, quota })
    }

    /* -------------------------------------------------------- rewrite */
    const slide = normalizeSlide(body.slide)
    if (!slide) return json({ ok: false, error: "Слайд повреждён." }, 400)
    const layout = isSlideLayout(body.layout) ? body.layout : undefined
    const instruction = String(body.instruction || "").trim().slice(0, 600)
    const deckTitle = String(body.deckTitle || "").trim().slice(0, 200)
    const neighbours = Array.isArray(body.neighbours) ? body.neighbours.map((item) => String(item || "").slice(0, 120)).slice(0, 4) : []

    const reservation = await reservePresentationCredits(userId, plan, authenticated, PRESENTATION_COSTS.slide)
    if (!reservation.ok) return json({ ok: false, code: reservation.code, error: reservation.error, quota: reservation.quota }, reservation.status)
    reserved = PRESENTATION_COSTS.slide
    refund = (amount) => refundPresentationCredits(userId, plan, authenticated, amount)

    const rewritten = await rewriteSlide({
      ...model,
      deckTitle,
      slide,
      layout,
      instruction,
      neighbours,
      language: languageOf(body.language, `${deckTitle} ${instruction}`),
      tone: toneOf(body.tone),
    })
    reserved = 0
    return json({ ok: true, slide: rewritten, quota: reservation.quota })
  } catch (error) {
    // Whatever was reserved and not delivered goes back.
    const quota = reserved ? await refund(reserved).catch(() => null) : null
    if (error instanceof PresentationEngineError) {
      return json({ ok: false, code: error.code, error: `${error.message} Кредиты не списаны.`, quota }, error.status)
    }
    if (error instanceof MalikModelRouteError) {
      const payload = malikModelErrorPayload(error)
      return json({ ok: false, code: error.code, error: `${payload.message || "Модель временно недоступна."} Кредиты не списаны.`, quota }, error.status)
    }
    console.warn("[MALIK_PRESENTATIONS]", error instanceof Error ? error.message : String(error))
    return json({ ok: false, error: "Не удалось собрать презентацию. Кредиты не списаны.", quota }, 503)
  } finally {
    const left = (inFlight().get(userId) || 1) - 1
    if (left > 0) inFlight().set(userId, left)
    else inFlight().delete(userId)
  }
}
