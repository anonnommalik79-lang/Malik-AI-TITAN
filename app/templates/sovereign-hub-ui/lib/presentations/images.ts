import { IMAGE_LAYOUTS, type GallerySlide, type Slide, type SlideImage } from "@/lib/presentations/types"

/**
 * Which pictures a slide still needs, and how a found picture is put on it.
 * Pure, shared by the studio (which asks for photos as slides arrive) and the
 * tests.
 */

export type PhotoSlot = { key: string; query: string; kind: "subject" | "mood" }

const STOP_WORDS = new Set(["a", "an", "the", "of", "in", "on", "with", "and", "at", "for", "to", "photo", "photograph", "image", "picture", "shot", "style", "cinematic", "realistic", "high", "quality", "detailed", "4k", "8k"])

/** When the model gave no search words, the first concrete words of its picture description. */
export function queryFromPrompt(prompt: string) {
  return String(prompt || "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 5)
    .join(" ")
}

function slideQuery(slide: Slide) {
  return (slide.imageQuery || queryFromPrompt(slide.imagePrompt || "")).trim()
}

export function photoSlots(slide: Slide): PhotoSlot[] {
  const kind = slide.imageKind === "subject" ? "subject" : "mood"
  if (slide.layout === "gallery") {
    const fallback = slideQuery(slide)
    return slide.items.flatMap((item, index) => {
      if (item.image) return []
      const query = (item.imageQuery || (fallback ? `${fallback} ${index + 1}` : "")).trim()
      return query ? [{ key: `${slide.id}#${index}`, query, kind }] : []
    })
  }
  if (!IMAGE_LAYOUTS.has(slide.layout) || slide.imageUrl) return []
  const query = slideQuery(slide)
  return query ? [{ key: slide.id, query, kind }] : []
}

export function applyPhoto(slide: Slide, key: string, photo: SlideImage): Slide {
  const [id, part] = key.split("#")
  if (id !== slide.id) return slide
  if (slide.layout === "gallery" && part !== undefined) {
    const index = Number(part)
    const items = slide.items.map((item, i) => (i === index ? { ...item, image: photo } : item))
    return { ...slide, items } as GallerySlide
  }
  return {
    ...slide,
    imageUrl: photo.url,
    ...(photo.credit ? { imageCredit: photo.credit } : {}),
    ...(photo.link ? { imageLink: photo.link } : {}),
  } as Slide
}

/** Every photo already on the deck, so the next search can avoid repeating one. */
export function usedPhotoUrls(slides: Slide[]) {
  return slides.flatMap((slide) => [
    ...(slide.imageUrl && !slide.imageUrl.startsWith("data:") ? [slide.imageUrl] : []),
    ...(slide.layout === "gallery" ? slide.items.map((item) => item.image?.url).filter((url): url is string => Boolean(url)) : []),
  ])
}
