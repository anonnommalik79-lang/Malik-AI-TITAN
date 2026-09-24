/**
 * A deck is data, not HTML.
 *
 * The old generator asked a model for "a complete HTML slide deck" and got
 * back one long string: every slide the same shape, nothing editable, nothing
 * exportable, and a layout decided by whichever model answered. What makes the
 * presentation tools people actually pay for feel different is that the model
 * never touches design. It chooses what each slide is — a big number, a
 * timeline, a comparison — and fills in the words; the renderer owns every
 * pixel. That is why a deck can change theme instantly, be edited on the
 * slide itself, and export to PowerPoint with the same layout it had on
 * screen.
 *
 * Sixteen layouts cover what a good deck is made of — from a full-bleed photo
 * cover to icon cards, a process of arrows and a gallery of photographs. Each
 * has a fixed, small set of fields with hard limits on how much text it may
 * hold, because the most common way an AI deck looks amateur is a slide with
 * nine bullets.
 */

export const SLIDE_LAYOUTS = [
  "title",
  "section",
  "bullets",
  "two-column",
  "stat",
  "quote",
  "image-text",
  "cards",
  "timeline",
  "comparison",
  "chart",
  "closing",
  "hero",
  "features",
  "process",
  "gallery",
] as const

export type SlideLayout = (typeof SLIDE_LAYOUTS)[number]

export type SlidePoint = {
  title: string
  body?: string
}

export type SlideStat = {
  value: string
  label: string
}

export type SlideStep = {
  label: string
  title: string
  body?: string
}

export type SlideColumn = {
  heading: string
  points: string[]
}

export type ChartDatum = {
  label: string
  value: number
}

/** The icons a feature card can carry. The renderer and the export draw them. */
export const DECK_ICON_NAMES = [
  "sparkles", "rocket", "target", "trending", "chart", "users", "user", "shield", "lock", "globe",
  "map", "zap", "clock", "calendar", "star", "heart", "leaf", "coins", "wallet", "building",
  "home", "truck", "cpu", "code", "book", "graduation", "trophy", "handshake", "lightbulb", "message",
  "phone", "mail", "camera", "music", "coffee", "car", "plane", "sun", "settings", "check",
  "search", "layers", "package", "store", "factory", "scale", "stethoscope", "brain", "palette", "megaphone",
  "gift", "flag", "mountain", "key", "smile", "wifi", "cloud", "database", "percent", "award",
] as const

export type DeckIconName = (typeof DECK_ICON_NAMES)[number]

export type FeatureItem = {
  icon: DeckIconName
  title: string
  body?: string
}

export type ProcessStep = {
  title: string
  body?: string
}

/** A photograph on a slide, with the credit its licence asks for. */
export type SlideImage = {
  url: string
  credit?: string
  /** The page the photo came from, for anyone who wants to check the licence. */
  link?: string
}

export type GalleryItem = {
  caption: string
  /** English search words for a photograph of exactly this. */
  imageQuery?: string
  image?: SlideImage
}

type SlideBase = {
  id: string
  layout: SlideLayout
  /** What the speaker says. Never rendered on the slide itself. */
  notes?: string
  /**
   * A description of the picture this slide wants, in English, for the image
   * model. Only layouts with an image slot use it.
   */
  imagePrompt?: string
  /** Filled in once a picture has been found or generated. */
  imageUrl?: string
  /**
   * English search words for a real photograph of this slide's subject:
   * "Abylai Khan portrait", "espresso bar interior", "Almaty mountains".
   */
  imageQuery?: string
  /**
   * "subject" — a specific real thing (a person, a place, an event, a
   * product) that encyclopaedic photo archives are best at; "mood" — a
   * general scene that stock photography is best at.
   */
  imageKind?: "subject" | "mood"
  /** Who took the photo and under what licence, shown small on the slide. */
  imageCredit?: string
  /** The source page of the photo. */
  imageLink?: string
}

export type TitleSlide = SlideBase & { layout: "title"; kicker?: string; title: string; subtitle?: string }
export type SectionSlide = SlideBase & { layout: "section"; number?: string; title: string; subtitle?: string }
export type BulletsSlide = SlideBase & { layout: "bullets"; title: string; intro?: string; points: SlidePoint[] }
export type TwoColumnSlide = SlideBase & { layout: "two-column"; title: string; left: SlideColumn; right: SlideColumn }
export type StatSlide = SlideBase & { layout: "stat"; title: string; stats: SlideStat[]; context?: string }
export type QuoteSlide = SlideBase & { layout: "quote"; quote: string; author?: string; role?: string }
export type ImageTextSlide = SlideBase & { layout: "image-text"; title: string; body?: string; points: string[]; imageSide: "left" | "right" }
export type CardsSlide = SlideBase & { layout: "cards"; title: string; cards: SlidePoint[] }
export type TimelineSlide = SlideBase & { layout: "timeline"; title: string; steps: SlideStep[] }
export type ComparisonSlide = SlideBase & {
  layout: "comparison"
  title: string
  columns: [string, string]
  rows: Array<{ label: string; values: [string, string] }>
  verdict?: string
}
export type ChartSlide = SlideBase & { layout: "chart"; title: string; unit?: string; data: ChartDatum[]; takeaway?: string }
export type ClosingSlide = SlideBase & { layout: "closing"; title: string; subtitle?: string; contact?: string }
/** A photograph across the whole slide with the words over it. */
export type HeroSlide = SlideBase & { layout: "hero"; kicker?: string; title: string; subtitle?: string }
/** Three to six parallel ideas, each with an icon. */
export type FeaturesSlide = SlideBase & { layout: "features"; title: string; intro?: string; items: FeatureItem[] }
/** A sequence drawn as arrows: how something gets done. */
export type ProcessSlide = SlideBase & { layout: "process"; title: string; steps: ProcessStep[] }
/** Two or three photographs with captions. */
export type GallerySlide = SlideBase & { layout: "gallery"; title: string; intro?: string; items: GalleryItem[] }

export type Slide =
  | TitleSlide
  | SectionSlide
  | BulletsSlide
  | TwoColumnSlide
  | StatSlide
  | QuoteSlide
  | ImageTextSlide
  | CardsSlide
  | TimelineSlide
  | ComparisonSlide
  | ChartSlide
  | ClosingSlide
  | HeroSlide
  | FeaturesSlide
  | ProcessSlide
  | GallerySlide

export type OutlineItem = {
  title: string
  /** One sentence: what this slide must make the audience believe. */
  point: string
  layout: SlideLayout
}

export type DeckOutline = {
  title: string
  items: OutlineItem[]
}

export type Deck = {
  id: string
  title: string
  theme: ThemeId
  language: DeckLanguage
  slides: Slide[]
  createdAt: number
  updatedAt: number
  prompt: string
}

export type DeckLanguage = "ru" | "kk" | "en"

export type DeckTone = "confident" | "friendly" | "academic" | "bold"

export type ThemeId = "obsidian" | "paper" | "ember" | "forest" | "sand" | "royal"

/** Layouts that carry one picture in imageUrl. The gallery carries several, per item. */
export const IMAGE_LAYOUTS: ReadonlySet<SlideLayout> = new Set(["title", "image-text", "hero"])
