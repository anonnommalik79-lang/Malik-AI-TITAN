import type { Slide } from "@/lib/presentations/types"

/**
 * One deterministic art-direction pass for all 16 slide layouts.
 * The slide remains a fixed 1280×720 composition on desktop, phone,
 * PowerPoint and print; density only affects spacing and typography.
 * No measurement loop, images, third-party library or server work.
 *
 * This is a conservative estimate, not proof that every font will fit.
 */
export type SlideDensity = "balanced" | "compact" | "dense" | "ultra"

export function slideDensity(slide: Slide): SlideDensity {
  if (slide.fitMode === "compact" || slide.fitMode === "dense" || slide.fitMode === "ultra") return slide.fitMode
  const length = (value?: string) => (value || "").trim().length
  const max = (values: Array<string | undefined>) => Math.max(0, ...values.map(length))
  const total = (values: Array<string | undefined>) => values.reduce((n, value) => n + length(value), 0)

  switch (slide.layout) {
    case "title":
    case "hero": {
      const title = length(slide.title)
      const subtitle = length(slide.subtitle)
      // A title truncated at a word boundary still represents overflow.
      if (title >= 84 || (slide.title.endsWith("…") && title >= 75) || subtitle > 145) return "dense"
      if (title > 52 || subtitle > 95) return "compact"
      return "balanced"
    }
    case "closing":
    case "section":
      return length(slide.title) > 86 ? "dense" : length(slide.title) > 52 ? "compact" : "balanced"
    case "quote":
      return length(slide.quote) > 205 ? "dense" : length(slide.quote) > 125 ? "compact" : "balanced"
    case "bullets": {
      const words = slide.points.flatMap(p => [p.title, p.body])
      if (slide.points.length >= 5 && (total(words) > 400 || max(words) > 110)) return "dense"
      if (slide.points.length >= 4 || total(words) > 330 || max(words) > 100) return "compact"
      return "balanced"
    }
    case "two-column": {
      const words = [slide.left.heading, slide.right.heading, ...slide.left.points, ...slide.right.points]
      if (slide.left.points.length + slide.right.points.length > 8 || total(words) > 460) return "dense"
      if (total(words) > 310 || max(words) > 110) return "compact"
      return "balanced"
    }
    case "stat":
      return max(slide.stats.map(s => s.label)) > 56 ? "dense" : slide.stats.length === 3 ? "compact" : "balanced"
    case "image-text":
      return length(slide.body) > 250 || total(slide.points) > 220
        ? "dense" : length(slide.body) > 160 || slide.points.length >= 4 ? "compact" : "balanced"
    case "cards": {
      const words = slide.cards.flatMap(c => [c.title, c.body])
      if (total(words) > 380 || max(words) > 130) return "dense"
      if (slide.cards.length === 4 || total(words) > 280) return "compact"
      return "balanced"
    }
    case "features": {
      const words = slide.items.flatMap(c => [c.title, c.body])
      if (total(words) > 420 || max(words) > 115) return "dense"
      if (slide.items.length >= 5 || total(words) > 300) return "compact"
      return "balanced"
    }
    case "process": {
      const words = slide.steps.flatMap(c => [c.title, c.body])
      if (slide.steps.length >= 5 && total(words) > 210) return "dense"
      if (slide.steps.length >= 5 || total(words) > 280) return "compact"
      return "balanced"
    }
    case "timeline": {
      const words = slide.steps.flatMap(c => [c.title, c.body])
      if (slide.steps.length >= 5 && total(words) > 340) return "dense"
      if (slide.steps.length >= 5 || total(words) > 250) return "compact"
      return "balanced"
    }
    case "comparison": {
      const words = slide.rows.flatMap(r => [r.label, ...r.values])
      if (slide.rows.length >= 6 || max(words) > 65) return "dense"
      if (slide.rows.length >= 5 || total(words) > 290) return "compact"
      return "balanced"
    }
    case "chart":
      return max(slide.data.map(d => d.label)) > 20 ? "dense"
        : slide.data.length >= 7 ? "compact" : "balanced"
    case "gallery":
      return slide.items.length === 3 && max(slide.items.map(d => d.caption)) > 65
        ? "compact" : "balanced"
  }
}

/** Screens and the PowerPoint export can share the same content-safe headline scale. */
export function headlineScale(slide: Slide): number {
  const density = slideDensity(slide)
  return density === "ultra" ? 0.62 : density === "dense" ? 0.72 : density === "compact" ? 0.86 : 1
}
