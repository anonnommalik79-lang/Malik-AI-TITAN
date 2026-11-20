import { MAX_PRESENTATION_TOPIC_CHARS, MAX_SLIDES, normalizeOutline, normalizeSlide } from "@/lib/presentations/deck"
import { isThemeId } from "@/lib/presentations/themes"
import type { DeckLanguage, DeckOutline, DeckTone, Slide, ThemeId } from "@/lib/presentations/types"

export type PresentationDraft = {
  id: string
  createdAt: number
  title: string
  topic: string
  language: DeckLanguage
  tone: DeckTone
  theme: ThemeId
  outline: DeckOutline
  /** null while the outline is being edited. In a deck, null entries are missing slides. */
  slides: Array<Slide | null> | null
}

export function readPresentationDraft(raw: string | null): PresentationDraft | null {
  if (!raw || raw.length > 2_000_000) return null
  try {
    const draft = JSON.parse(raw) as Partial<PresentationDraft>
    if (typeof draft?.id !== "string" || typeof draft.topic !== "string" || !draft.outline?.items.length || draft.outline.items.length > MAX_SLIDES) return null
    const outline = normalizeOutline(draft.outline, draft.topic, draft.outline.items.length, { preserveLayouts: true })
    if (!outline || outline.items.length !== draft.outline.items.length || !isThemeId(draft.theme)) return null
    if (draft.slides !== null && (!Array.isArray(draft.slides) || draft.slides.length !== outline.items.length)) return null
    return {
      id: draft.id, title: typeof draft.title === "string" ? draft.title : outline.title,
      topic: draft.topic.slice(0, MAX_PRESENTATION_TOPIC_CHARS), outline,
      slides: draft.slides?.map((value) => normalizeSlide(value)) ?? null,
      createdAt: Number(draft.createdAt) || Date.now(), theme: draft.theme,
      tone: draft.tone === "friendly" || draft.tone === "academic" || draft.tone === "bold" ? draft.tone : "confident",
      language: draft.language === "en" || draft.language === "kk" ? draft.language : "ru",
    }
  } catch {
    return null
  }
}

/** Keep large generated images out of browser storage while preserving content and empty slots. */
export function packPresentationDraft(draft: PresentationDraft) {
  const slides = draft.slides?.map((slide) => {
    if (!slide) return null
    if (slide.layout === "gallery") return { ...slide, items: slide.items.map((item) => item.image?.url.startsWith("data:") ? { ...item, image: undefined } : item) }
    return slide.imageUrl?.startsWith("data:") ? { ...slide, imageUrl: undefined } : slide
  }) ?? null
  return JSON.stringify({ ...draft, slides })
}
