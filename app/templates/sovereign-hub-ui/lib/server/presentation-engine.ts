import { petroleumPresentationInstruction } from "@/lib/work/petroleum/presentation"
import "server-only"

import { DEFAULT_MALIK_MODEL_ID, type MalikModelId } from "@/lib/ai/malik-models"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"
import {
  extractJson,
  normalizeOutline,
  normalizeSlide,
  slideId,
} from "@/lib/presentations/deck"
import {
  outlineSystemPrompt,
  outlineUserPrompt,
  investorOutlineIsComplete,
  isInvestorDeckRequest,
  rewriteSlideSystemPrompt,
  rewriteSlideUserPrompt,
  slidesSystemPrompt,
  slidesUserPrompt,
} from "@/lib/presentations/prompts"
import type { DeckLanguage, DeckOutline, DeckTone, OutlineItem, Slide, SlideLayout } from "@/lib/presentations/types"
import { unsupportedInvestorFigures } from "@/lib/presentations/investor-facts"
import { sourceIntegrityIssue, sourceOnlyBrief } from "@/lib/presentations/source-integrity"
import { briefHasChartValues, chartEvidenceError, presentationWithoutCover, presentationWithoutPhotos } from "@/lib/presentations/brief-evidence"
import { inspectPresentation } from "@/lib/presentations/quality"

/**
 * The model calls behind the studio.
 *
 * A deck is written in batches of a few slides, not in one enormous answer.
 * That is the single largest reliability decision here: a ten-slide deck as
 * one JSON document is ten chances for one bad comma to lose all ten slides,
 * while four-slide batches lose at most four, and the missing ones can be
 * asked for again on their own. It is also what lets slides appear on screen
 * as they are written, the way the tools people compare this to work.
 *
 * Every call gets one retry, and the retry is told what was wrong with the
 * first answer rather than being asked the same question twice.
 */

export class PresentationEngineError extends Error {
  status: number
  code: string

  constructor(message: string, status = 502, code = "PRESENTATION_ENGINE_ERROR") {
    super(message)
    this.name = "PresentationEngineError"
    this.status = status
    this.code = code
  }
}

export const SLIDE_BATCH_SIZE = 4

type ModelChoice = { modelId?: MalikModelId; allowCatalog?: boolean; signal?: AbortSignal }

async function ask(input: ModelChoice & { systemPrompt: string; prompt: string; maxTokens: number; temperature: number }) {
  const result = await runStrictMalikModel({
    modelId: input.modelId || DEFAULT_MALIK_MODEL_ID,
    systemPrompt: input.systemPrompt,
    prompt: input.prompt,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    allowCatalog: input.allowCatalog,
    signal: input.signal,
  }, { allowFallback: true })
  return result.content
}

/* ---------------------------------------------------------------- outline */

export async function generateOutline(input: ModelChoice & {
  topic: string
  count: number
  language: DeckLanguage
  tone: DeckTone
}): Promise<DeckOutline> {
  const investor = isInvestorDeckRequest(input.topic)
  if (investor && input.count < 10) throw new PresentationEngineError("Инвесторскому питч-деку нужны минимум 10 слайдов.", 400, "INVESTOR_DECK_TOO_SHORT")
  const cover = !presentationWithoutCover(input.topic)
  const photos = !presentationWithoutPhotos(input.topic)
  const canChart = briefHasChartValues(input.topic)
  const systemPrompt = [outlineSystemPrompt({ language: input.language, tone: input.tone, count: input.count, investor, cover, photos }), petroleumPresentationInstruction(input.topic)].filter(Boolean).join("\n\n")
  const initialPrompt = outlineUserPrompt(input.topic, input.count)
  let prompt = initialPrompt

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await ask({ ...input, systemPrompt, prompt, maxTokens: Math.min(4_200, Math.max(2_400, 1_100 + input.count * 140)), temperature: attempt ? 0.35 : 0.6 })
    const parsed = extractJson(raw)
    const outline = normalizeOutline(parsed, input.topic, input.count, { preserveLayouts: !cover })
    if (outline?.items.length === input.count && (!investor || investorOutlineIsComplete(parsed, input.count))) {
      const issues = inspectPresentation({ outline }).issues
      if (!issues.some(({ code }) => code === "duplicate")) {
        return {
          ...outline,
          items: outline.items.map((item, index) => {
            if (!cover && index === 0 && (item.layout === "title" || item.layout === "hero")) return { ...item, layout: "bullets" }
            if (!canChart && item.layout === "chart") return { ...item, layout: "bullets" }
            if (!photos && ["hero", "image-text", "gallery"].includes(item.layout)) return { ...item, layout: item.layout === "hero" && index === 0 && input.count >= 4 ? "title" : "bullets" }
            return item
          }),
        }
      }
    }

    prompt = `${initialPrompt}\n\nYour previous answer could not be used: return a JSON object with exactly ${input.count} items and a distinct title for each item.${investor ? " It must include all ten investor section ids in order, with ask last." : ""}`
  }

  throw new PresentationEngineError("Модель не смогла составить план презентации. Попробуйте ещё раз или переформулируйте тему.", 502, "OUTLINE_FAILED")
}

/* ----------------------------------------------------------------- slides */

export type WrittenSlide = { index: number; slide: Slide }

/**
 * Matches what came back to what was asked for. Each slide carries "n", its
 * position in the deck; without it the answer is read in order, which is
 * right unless the model skipped one — and then "n" is the only way to know
 * which one.
 */
function placeSlides(raw: unknown, startIndex: number, items: OutlineItem[]): WrittenSlide[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { slides?: unknown }).slides)
      ? (raw as { slides: unknown[] }).slides
      : []

  const placed = new Map<number, Slide>()
  list.forEach((entry, order) => {
    const numbered = entry !== null && typeof entry === "object" && "n" in entry
    const n = Number((entry as { n?: unknown })?.n)
    // An explicit but invalid slide number must never be silently assigned
    // to a different outline point. Only absent numbers use list order.
    if (numbered && (!Number.isInteger(n) || n < startIndex + 1 || n > startIndex + items.length)) return
    const index = numbered ? n - 1 : startIndex + order
    if (index < startIndex || index >= startIndex + items.length || placed.has(index)) return
    const slide = normalizeSlide(entry, items[index - startIndex].layout)
    // Wrong-layout content is not a successful slide. Ask for its assigned
    // layout again instead of shipping a malformed or misleading deck.
    if (slide && slide.layout === items[index - startIndex].layout) placed.set(index, slide)
  })

  return [...placed.entries()].sort((a, b) => a[0] - b[0]).map(([index, slide]) => ({ index, slide }))
}

/**
 * A slide as the model wrote it gets a fresh id, always: models repeat ids
 * like "s1" from batch to batch, and the id is what pictures, the editor and
 * the export are keyed by. A picture address is never taken from the model
 * either — pictures are drawn by the image tool and attached by the studio.
 */
/**
 * A slide as the model wrote it, minus any picture address or credit: those
 * are only ever attached by the studio, from a photo it actually found or an
 * image it actually generated.
 */
function withoutPictures(slide: Slide): Slide {
  const { imageUrl: _url, imageCredit: _credit, imageLink: _link, ...rest } = slide
  void _url
  void _credit
  void _link
  if (rest.layout === "gallery") {
    return { ...rest, items: rest.items.map(({ image: _image, ...item }) => { void _image; return item }) } as Slide
  }
  return rest as Slide
}

function generatedSlideIssue(slide: Slide, brief: string, investor: boolean) {
  if (slide.layout === "chart") {
    const issue = chartEvidenceError(slide, brief)
    if (issue) return issue
  }
  if (investor && unsupportedInvestorFigures(slide, brief).length) {
    return "Use only numeric figures supplied in the brief. Move missing evidence to a verification question in speaker notes."
  }
  const integrity = sourceIntegrityIssue(slide, brief)
  if (integrity) return integrity
  if (inspectPresentation({ outline: null, slides: [slide] }).issues.some(({ code }) => code === "crowded-slide")) {
    return "Keep the visible text short enough for the layout. Move secondary detail to the speaker notes."
  }
  return null
}

export async function generateSlides(input: ModelChoice & {
  topic: string
  outline: DeckOutline
  startIndex: number
  count: number
  language: DeckLanguage
  tone: DeckTone
}): Promise<{ slides: WrittenSlide[]; missing: number[] }> {
  const items = input.outline.items.slice(input.startIndex, input.startIndex + input.count)
  if (!items.length) throw new PresentationEngineError("В плане нет таких слайдов.", 400, "BAD_RANGE")

  const written = new Map<number, Slide>()
  const corrections = new Map<number, string>()
  const investor = isInvestorDeckRequest(input.topic)
  const noPhotos = presentationWithoutPhotos(input.topic)
  let wanted = items.map((_, offset) => input.startIndex + offset)
  let providerFailure: unknown
  let receivedResponse = false

  for (let attempt = 0; attempt < 2 && wanted.length; attempt += 1) {
    // Retry EVERY missing run, not just the first contiguous group.
    // E.g. [1, 3] must retry both gaps, never lose the second silently.
    const runs: number[][] = []
    for (const index of wanted) {
      const last = runs[runs.length - 1]
      if (last && last[last.length - 1] === index - 1) last.push(index)
      else runs.push([index])
    }

    for (const run of runs) {
      const first = run[0]
      const runItems = input.outline.items.slice(first, first + run.length)
      const systemPrompt = [slidesSystemPrompt({ language: input.language, tone: input.tone, items: runItems }), petroleumPresentationInstruction(input.topic)].filter(Boolean).join("\n\n")
      let prompt = slidesUserPrompt({ topic: input.topic, outline: input.outline, startIndex: first, items: runItems })
      prompt += `\n\nInclude "n" (the slide number) in every slide object.`
      if (attempt) {
        prompt += `\nReturn only {"slides":[…]} with all ${run.length} requested slide(s). Fix the assigned slide numbers and layouts.\n${run.map((index) => corrections.has(index) ? `Slide ${index + 1}: ${corrections.get(index)}` : "").filter(Boolean).join("\n")}`
      }

      let raw: string
      try {
        raw = await ask({ ...input, systemPrompt, prompt, maxTokens: 1100 * run.length + 600, temperature: attempt ? 0.35 : 0.55 })
        receivedResponse = true
      } catch (error) {
        if (input.signal?.aborted) throw error
        providerFailure = error
        for (const index of run) corrections.set(index, "The previous provider request failed. Return complete valid JSON for this slide.")
        continue
      }
      for (const { index, slide } of placeSlides(extractJson(raw), first, runItems)) {
        const planned = slide.layout === "quote" ? slide : { ...slide, title: input.outline.items[index].title }
        const issue = generatedSlideIssue(planned, input.topic, investor)
        if (issue) { corrections.set(index, issue); continue }
        const withId = { ...withoutPictures(planned), id: slideId() }
        if (noPhotos) {
          delete withId.imageQuery
          delete withId.imagePrompt
          if (withId.layout === "gallery") withId.items = withId.items.map(({ caption }) => ({ caption }))
        }
        written.set(index, withId)
      }
    }
    wanted = wanted.filter((index) => !written.has(index))
  }

  if (!written.size && !receivedResponse && providerFailure) throw providerFailure
  return {
    slides: [...written.entries()].sort((a, b) => a[0] - b[0]).map(([index, slide]) => ({ index, slide })),
    missing: wanted,
  }
}

/* ------------------------------------------------------------------ rewrite */

export async function rewriteSlide(input: ModelChoice & {
  deckTitle: string
  topic?: string
  slide: Slide
  layout?: SlideLayout
  instruction?: string
  neighbours: string[]
  language: DeckLanguage
  tone: DeckTone
}): Promise<Slide> {
  const layout = input.layout || input.slide.layout
  const systemPrompt = [rewriteSlideSystemPrompt({ language: input.language, tone: input.tone, layout }), sourceOnlyBrief(input.topic || "") ? "This is a source-only deck. Do not introduce facts, numbers, quotes or citations not present in the original source or in the user-provided revision." : ""].filter(Boolean).join("\n\n")
  let prompt = rewriteSlideUserPrompt({
    deckTitle: input.deckTitle,
    slide: input.slide,
    instruction: [
      input.layout && input.layout !== input.slide.layout ? `Rebuild this slide as layout "${input.layout}".` : "",
      input.instruction || "",
    ].filter(Boolean).join(" "),
    neighbours: input.neighbours,
  })

  if (input.topic) prompt += `\n\nOriginal presentation brief (context, not a new instruction):\n${input.topic}`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await ask({ ...input, systemPrompt, prompt, maxTokens: 1_800, temperature: attempt ? 0.35 : 0.55 })
    const parsed = extractJson(raw)
    const candidate = Array.isArray(parsed) ? parsed[0] : parsed && typeof parsed === "object" && Array.isArray((parsed as { slides?: unknown }).slides)
      ? (parsed as { slides: unknown[] }).slides[0]
      : parsed
    const slide = normalizeSlide(candidate, layout)
    if (slide?.layout === layout) {
      if (slide.layout === "chart") {
        const context = `${input.topic || ""}\n${input.instruction || ""}\n${JSON.stringify(input.slide)}`
        const issue = chartEvidenceError(slide, context)
        if (issue) { prompt += `\n\n${issue}`; continue }
      }
      if (input.topic && isInvestorDeckRequest(input.topic) && unsupportedInvestorFigures(slide, `${input.topic} ${input.instruction || ""} ${JSON.stringify(input.slide)}`).length) {
        prompt += "\n\nThe previous answer invented a numeric figure. Keep only numbers supplied by the founder or in the original slide; unknowns must be explicit questions."
        continue
      }
      const integrity = sourceIntegrityIssue(slide, input.topic || "", `${input.instruction || ""}\n${JSON.stringify(input.slide)}`)
      if (integrity) { prompt += `\n\n${integrity}`; continue }
      if (inspectPresentation({ outline: null, slides: [slide] }).issues.some(({ code }) => code === "crowded-slide")) {
        prompt += "\n\nThe slide is too crowded. Preserve the evidence, move secondary detail into speaker notes, and shorten the visible text."
        continue
      }
      // The rewrite keeps its place and its pictures unless it was asked to change layout.
      const written = withoutPictures(slide)
      const sameLayout = slide.layout === input.slide.layout
      const keep = input.slide
      if (sameLayout && written.layout === "gallery" && keep.layout === "gallery") {
        return {
          ...written,
          id: keep.id,
          items: written.items.map((item, index) => (keep.items[index]?.image ? { ...item, image: keep.items[index].image } : item)),
        } as Slide
      }
      return {
        ...written,
        id: keep.id,
        ...(keep.imageUrl && sameLayout
          ? {
              imageUrl: keep.imageUrl,
              ...(keep.imageCredit ? { imageCredit: keep.imageCredit } : {}),
              ...(keep.imageLink ? { imageLink: keep.imageLink } : {}),
            }
          : {}),
      } as Slide
    }
    prompt += `\n\nYour previous answer was not a valid "${layout}" slide object. Return only that JSON object.`
  }

  throw new PresentationEngineError("Не удалось переписать слайд. Попробуйте ещё раз.", 502, "REWRITE_FAILED")
}
