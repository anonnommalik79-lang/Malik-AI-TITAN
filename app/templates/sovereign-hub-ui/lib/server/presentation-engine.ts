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
  rewriteSlideSystemPrompt,
  rewriteSlideUserPrompt,
  slidesSystemPrompt,
  slidesUserPrompt,
} from "@/lib/presentations/prompts"
import type { DeckLanguage, DeckOutline, DeckTone, OutlineItem, Slide, SlideLayout } from "@/lib/presentations/types"

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

type ModelChoice = { modelId?: MalikModelId; allowCatalog?: boolean }

async function ask(input: ModelChoice & { systemPrompt: string; prompt: string; maxTokens: number; temperature: number }) {
  const result = await runStrictMalikModel({
    modelId: input.modelId || DEFAULT_MALIK_MODEL_ID,
    systemPrompt: input.systemPrompt,
    prompt: input.prompt,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    allowCatalog: input.allowCatalog,
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
  const systemPrompt = outlineSystemPrompt({ language: input.language, tone: input.tone, count: input.count })
  let prompt = outlineUserPrompt(input.topic, input.count)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await ask({ ...input, systemPrompt, prompt, maxTokens: 2_400, temperature: attempt ? 0.35 : 0.6 })
    const outline = normalizeOutline(extractJson(raw), input.topic, input.count)
    if (outline && outline.items.length >= Math.min(input.count, 4)) return outline

    prompt = `${outlineUserPrompt(input.topic, input.count)}\n\nYour previous answer could not be used: it was not a JSON object with an "items" array of ${input.count} slides. Return only that JSON object.`
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
    const n = Number((entry as { n?: unknown })?.n)
    const index = Number.isInteger(n) && n >= startIndex + 1 && n <= startIndex + items.length
      ? n - 1
      : startIndex + order
    if (index < startIndex || index >= startIndex + items.length || placed.has(index)) return
    const slide = normalizeSlide(entry, items[index - startIndex].layout)
    if (slide) placed.set(index, freshSlide(slide))
  })

  return [...placed.entries()].sort((a, b) => a[0] - b[0]).map(([index, slide]) => ({ index, slide }))
}

/**
 * A slide as the model wrote it gets a fresh id, always: models repeat ids
 * like "s1" from batch to batch, and the id is what pictures, the editor and
 * the export are keyed by. A picture address is never taken from the model
 * either — pictures are drawn by the image tool and attached by the studio.
 */
function freshSlide(slide: Slide): Slide {
  const { imageUrl: _ignored, ...rest } = slide
  void _ignored
  return { ...rest, id: slideId() } as Slide
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
  let wanted = items.map((_, offset) => input.startIndex + offset)

  for (let attempt = 0; attempt < 2 && wanted.length; attempt += 1) {
    // Ask only for what is still missing, as one contiguous run at a time.
    const first = wanted[0]
    const run = wanted.filter((index, position) => index === first + position)
    const runItems = input.outline.items.slice(first, first + run.length)

    const systemPrompt = slidesSystemPrompt({ language: input.language, tone: input.tone, items: runItems })
    let prompt = slidesUserPrompt({ topic: input.topic, outline: input.outline, startIndex: first, items: runItems })
    prompt += `\n\nInclude "n" (the slide number) in every slide object.`
    if (attempt) prompt += `\nYour previous answer was missing or invalid for these slides. Return only {"slides":[…]} with all ${run.length} of them.`

    const raw = await ask({ ...input, systemPrompt, prompt, maxTokens: 900 * run.length + 600, temperature: attempt ? 0.4 : 0.7 })
    for (const { index, slide } of placeSlides(extractJson(raw), first, runItems)) written.set(index, slide)
    wanted = wanted.filter((index) => !written.has(index))
  }

  return {
    slides: [...written.entries()].sort((a, b) => a[0] - b[0]).map(([index, slide]) => ({ index, slide })),
    missing: wanted,
  }
}

/* ------------------------------------------------------------------ rewrite */

export async function rewriteSlide(input: ModelChoice & {
  deckTitle: string
  slide: Slide
  layout?: SlideLayout
  instruction?: string
  neighbours: string[]
  language: DeckLanguage
  tone: DeckTone
}): Promise<Slide> {
  const layout = input.layout || input.slide.layout
  const systemPrompt = rewriteSlideSystemPrompt({ language: input.language, tone: input.tone, layout })
  let prompt = rewriteSlideUserPrompt({
    deckTitle: input.deckTitle,
    slide: input.slide,
    instruction: [
      input.layout && input.layout !== input.slide.layout ? `Rebuild this slide as layout "${input.layout}".` : "",
      input.instruction || "",
    ].filter(Boolean).join(" "),
    neighbours: input.neighbours,
  })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await ask({ ...input, systemPrompt, prompt, maxTokens: 1_400, temperature: attempt ? 0.4 : 0.7 })
    const parsed = extractJson(raw)
    const candidate = Array.isArray(parsed) ? parsed[0] : parsed && typeof parsed === "object" && Array.isArray((parsed as { slides?: unknown }).slides)
      ? (parsed as { slides: unknown[] }).slides[0]
      : parsed
    const slide = normalizeSlide(candidate, layout)
    if (slide) {
      // The rewrite keeps its place and its picture unless it was asked to change.
      const { imageUrl: _ignored, ...written } = slide
      void _ignored
      return {
        ...written,
        id: input.slide.id,
        ...(input.slide.imageUrl && slide.layout === input.slide.layout ? { imageUrl: input.slide.imageUrl } : {}),
      } as Slide
    }
    prompt += `\n\nYour previous answer was not a valid "${layout}" slide object. Return only that JSON object.`
  }

  throw new PresentationEngineError("Не удалось переписать слайд. Попробуйте ещё раз.", 502, "REWRITE_FAILED")
}
