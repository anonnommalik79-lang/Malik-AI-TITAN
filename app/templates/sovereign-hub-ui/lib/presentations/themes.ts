import { THEME_ID_LIST, type DeckTone, type ThemeId } from "@/lib/presentations/types"

/**
 * Thirteen design systems, written once and read by the screen, the PDF and
 * PowerPoint.
 *
 * A theme used to be six colours on one composition, which is why every deck
 * looked like the same template. Now a theme is a whole visual language:
 *
 *  - typography — its own heading and body faces (Google Fonts with Cyrillic
 *    and the Kazakh letters), weight, tracking and case;
 *  - background art — aurora light, a neon grid, a steppe ornament, editorial
 *    rules, a mesh of warm colour (drawn by design.ts as one SVG that the
 *    screen shows and the PowerPoint export rasterises, so they match);
 *  - surface — how a card is built: glass, outline, soft shadow, a brutal
 *    hard shadow, or no card at all, only rules;
 *  - photo shape and cover composition — a diagonal cut, a framed picture,
 *    an arch, an editorial half-page, a full-bleed cover.
 *
 * Every colour is a plain six-digit hex because PowerPoint accepts nothing
 * else. Fonts in the .pptx are ones Office ships on Windows and macOS, so a
 * downloaded deck never falls back to a substitute that reflows the text.
 *
 * Obsidian stays the default and stays black and white — it is the product's
 * own look. "Auto" in the studio picks a theme for the topic (pickTheme).
 */

export type Backdrop =
  | "glow" | "dots" | "streaks" | "organic" | "sun" | "rings"
  | "aurora" | "grid" | "rules" | "mesh" | "confetti" | "ornament" | "waves"

/** How a card, a column or a stat tile is drawn. */
export type Surface = "panel" | "glass" | "outline" | "soft" | "brutal" | "line"

/** The shape a photograph is cut to beside text. */
export type PhotoShape = "rounded" | "arch" | "sharp"

/** How the cover puts its photograph next to the title. */
export type CoverStyle = "diagonal" | "frame" | "arch" | "band"

/** Bullet slides as rows, as a grid of tiles, or alternating along the deck. */
export type ListStyle = "rows" | "grid" | "alternate"

export type DeckTheme = {
  id: ThemeId
  name: string
  /** One line for the theme picker. */
  note: string
  dark: boolean
  bg: string
  surface: string
  text: string
  muted: string
  accent: string
  /** The second colour of gradients, highlights and the background art. */
  accent2: string
  /** Text drawn on top of the accent colour. */
  onAccent: string
  border: string
  /** Bars in a chart, strongest first. */
  series: string[]
  headingFont: string
  bodyFont: string
  /** A monospace or display face for kickers and labels; body font if absent. */
  labelFont?: string
  /** Google Fonts families (with weights) the screen needs for this theme. */
  webFonts: string[]
  /** Font names PowerPoint ships with, so an exported deck never substitutes. */
  pptxHeadingFont: string
  pptxBodyFont: string
  /** Heading weight on screen; serif themes read better lighter. */
  headingWeight: number
  /** Average width of a figure in the heading face, in em: sizes big numbers so they never collide. */
  figureWidth: number
  /** Letter spacing of headings, in em. */
  headingTracking: number
  titleCase: "none" | "upper"
  /** Large headings painted with the accent gradient on screen. */
  titleGradient: boolean
  backdrop: Backdrop
  surfaceStyle: Surface
  /** Corner radius of cards on the 1280 × 720 canvas, in px. */
  radius: number
  photo: PhotoShape
  cover: CoverStyle
  list: ListStyle
}

const SANS = `"Inter", "SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif`
const stack = (family: string, fallback: "sans" | "serif" | "mono" = "sans") =>
  `"${family}", ${fallback === "serif" ? `"Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif` : fallback === "mono" ? `"JetBrains Mono", Consolas, "SF Mono", monospace` : SANS}`

export const DECK_THEMES: Record<ThemeId, DeckTheme> = {
  obsidian: {
    id: "obsidian",
    name: "Обсидиан",
    note: "Элегантная тьма",
    dark: true,
    bg: "000000",
    surface: "111111",
    text: "FFFFFF",
    muted: "A3A3A3",
    accent: "FFFFFF",
    accent2: "737373",
    onAccent: "000000",
    border: "2A2A2A",
    series: ["FFFFFF", "A3A3A3", "737373", "525252", "404040", "262626"],
    headingFont: SANS,
    bodyFont: SANS,
    webFonts: ["Inter:wght@400;500;600;700;800"],
    pptxHeadingFont: "Arial",
    pptxBodyFont: "Arial",
    headingWeight: 800,
    figureWidth: 0.62,
    headingTracking: -0.028,
    titleCase: "none",
    titleGradient: false,
    backdrop: "glow",
    surfaceStyle: "panel",
    radius: 18,
    photo: "rounded",
    cover: "diagonal",
    list: "alternate",
  },
  paper: {
    id: "paper",
    name: "Бумага",
    note: "Чистый швейцарский минимализм",
    dark: false,
    bg: "FFFFFF",
    surface: "F5F5F5",
    text: "0A0A0A",
    muted: "525252",
    accent: "0A0A0A",
    accent2: "A3A3A3",
    onAccent: "FFFFFF",
    border: "E5E5E5",
    series: ["0A0A0A", "404040", "737373", "A3A3A3", "D4D4D4", "E5E5E5"],
    headingFont: stack("Inter Tight"),
    bodyFont: stack("Inter Tight"),
    webFonts: ["Inter Tight:wght@400;500;600;700;800"],
    pptxHeadingFont: "Arial",
    pptxBodyFont: "Arial",
    headingWeight: 800,
    figureWidth: 0.58,
    headingTracking: -0.035,
    titleCase: "none",
    titleGradient: false,
    backdrop: "dots",
    surfaceStyle: "outline",
    radius: 14,
    photo: "sharp",
    cover: "frame",
    list: "rows",
  },
  ember: {
    id: "ember",
    name: "Жар",
    note: "Энергия, запуск, смелость",
    dark: true,
    bg: "120D0B",
    surface: "1E1612",
    text: "FBF3EC",
    muted: "C9A898",
    accent: "FF6A2C",
    accent2: "FFB347",
    onAccent: "120D0B",
    border: "3A2A23",
    series: ["FF6A2C", "FF9A62", "FFC49B", "C9A898", "8A6B5C", "5A4439"],
    headingFont: stack("Unbounded"),
    bodyFont: stack("Manrope"),
    webFonts: ["Unbounded:wght@500;600;700;800", "Manrope:wght@400;500;600;700;800"],
    pptxHeadingFont: "Arial Black",
    pptxBodyFont: "Arial",
    headingWeight: 700,
    figureWidth: 0.88,
    headingTracking: -0.03,
    titleCase: "none",
    titleGradient: false,
    backdrop: "streaks",
    surfaceStyle: "panel",
    radius: 20,
    photo: "rounded",
    cover: "diagonal",
    list: "grid",
  },
  forest: {
    id: "forest",
    name: "Лес",
    note: "Природа, экология, гармония",
    dark: true,
    bg: "0D1A14",
    surface: "14261D",
    text: "EEF5EE",
    muted: "9FB9A8",
    accent: "9BE15D",
    accent2: "3DD6A0",
    onAccent: "0D1A14",
    border: "25402F",
    series: ["9BE15D", "C4EE9A", "6FB53A", "9FB9A8", "5E7D69", "3C5646"],
    headingFont: stack("Manrope"),
    bodyFont: stack("Manrope"),
    webFonts: ["Manrope:wght@400;500;600;700;800"],
    pptxHeadingFont: "Trebuchet MS",
    pptxBodyFont: "Trebuchet MS",
    headingWeight: 800,
    figureWidth: 0.64,
    headingTracking: -0.03,
    titleCase: "none",
    titleGradient: false,
    backdrop: "organic",
    surfaceStyle: "soft",
    radius: 26,
    photo: "arch",
    cover: "arch",
    list: "alternate",
  },
  sand: {
    id: "sand",
    name: "Песок",
    note: "Тёплая классика, еда, ремесло",
    dark: false,
    bg: "F6EFE4",
    surface: "EDE3D3",
    text: "2A211A",
    muted: "7A6A5A",
    accent: "C2552D",
    accent2: "E9A23B",
    onAccent: "FFF8F0",
    border: "DCCDB6",
    series: ["C2552D", "E08A5F", "2A211A", "7A6A5A", "B9A58C", "DCCDB6"],
    headingFont: stack("Lora", "serif"),
    bodyFont: stack("Manrope"),
    webFonts: ["Lora:wght@500;600;700", "Manrope:wght@400;500;600;700;800"],
    pptxHeadingFont: "Georgia",
    pptxBodyFont: "Arial",
    headingWeight: 600,
    figureWidth: 0.6,
    headingTracking: -0.02,
    titleCase: "none",
    titleGradient: false,
    backdrop: "sun",
    surfaceStyle: "soft",
    radius: 22,
    photo: "rounded",
    cover: "frame",
    list: "rows",
  },
  royal: {
    id: "royal",
    name: "Корона",
    note: "Премиум, золото, роскошь",
    dark: true,
    bg: "120C1C",
    surface: "1D142D",
    text: "F6F1FF",
    muted: "B7A8D4",
    accent: "E9C46A",
    accent2: "B98CFF",
    onAccent: "120C1C",
    border: "3A2C52",
    series: ["E9C46A", "F2DC9E", "B7A8D4", "8C7AB0", "5F4E82", "3E3157"],
    headingFont: stack("Cormorant Garamond", "serif"),
    bodyFont: stack("Raleway"),
    webFonts: ["Cormorant Garamond:wght@500;600;700", "Raleway:wght@400;500;600;700"],
    pptxHeadingFont: "Georgia",
    pptxBodyFont: "Arial",
    headingWeight: 700,
    figureWidth: 0.52,
    headingTracking: -0.01,
    titleCase: "none",
    titleGradient: false,
    backdrop: "rings",
    surfaceStyle: "outline",
    radius: 4,
    photo: "sharp",
    cover: "frame",
    list: "rows",
  },
  aurora: {
    id: "aurora",
    name: "Аврора",
    note: "Технологии, стартап, будущее",
    dark: true,
    bg: "070A1F",
    surface: "121735",
    text: "F4F6FF",
    muted: "A9B0D6",
    accent: "8B7CFF",
    accent2: "34D6F5",
    onAccent: "070A1F",
    border: "2A3060",
    series: ["8B7CFF", "34D6F5", "FF5CA8", "B9B3FF", "6A74B8", "3A4180"],
    headingFont: stack("Onest"),
    bodyFont: stack("Onest"),
    webFonts: ["Onest:wght@400;500;600;700;800"],
    pptxHeadingFont: "Verdana",
    pptxBodyFont: "Arial",
    headingWeight: 800,
    figureWidth: 0.64,
    headingTracking: -0.035,
    titleCase: "none",
    titleGradient: true,
    backdrop: "aurora",
    surfaceStyle: "glass",
    radius: 24,
    photo: "rounded",
    cover: "frame",
    list: "grid",
  },
  cyber: {
    id: "cyber",
    name: "Кибер",
    note: "Неон, игры, крипто, хакатон",
    dark: true,
    bg: "05060A",
    surface: "0D1117",
    text: "E9FBEF",
    muted: "8FA39A",
    accent: "B6FF3B",
    accent2: "FF3BD4",
    onAccent: "05060A",
    border: "1F2A24",
    series: ["B6FF3B", "FF3BD4", "3BE8FF", "8FA39A", "5C6B64", "2E3833"],
    headingFont: stack("Exo 2"),
    bodyFont: stack("Exo 2"),
    labelFont: stack("JetBrains Mono", "mono"),
    webFonts: ["Exo 2:wght@400;500;600;700;800;900", "JetBrains Mono:wght@500;700"],
    pptxHeadingFont: "Consolas",
    pptxBodyFont: "Arial",
    headingWeight: 800,
    figureWidth: 0.64,
    headingTracking: 0.01,
    titleCase: "upper",
    titleGradient: false,
    backdrop: "grid",
    surfaceStyle: "outline",
    radius: 4,
    photo: "sharp",
    cover: "diagonal",
    list: "rows",
  },
  editorial: {
    id: "editorial",
    name: "Журнал",
    note: "Мода, медиа, искусство",
    dark: false,
    bg: "F4F0E8",
    surface: "FBF8F2",
    text: "141210",
    muted: "5E5850",
    accent: "D7261E",
    accent2: "141210",
    onAccent: "FFFFFF",
    border: "D9D1C4",
    series: ["D7261E", "141210", "5E5850", "A39B8F", "C9C1B4", "E5DED2"],
    headingFont: stack("Playfair Display", "serif"),
    bodyFont: stack("Golos Text"),
    webFonts: ["Playfair Display:ital,wght@0,600;0,700;0,800;1,600;1,700", "Golos Text:wght@400;500;600;700"],
    pptxHeadingFont: "Cambria",
    pptxBodyFont: "Arial",
    headingWeight: 700,
    figureWidth: 0.62,
    headingTracking: -0.015,
    titleCase: "none",
    titleGradient: false,
    backdrop: "rules",
    surfaceStyle: "line",
    radius: 0,
    photo: "sharp",
    cover: "band",
    list: "rows",
  },
  sunset: {
    id: "sunset",
    name: "Закат",
    note: "Маркетинг, бренд, лайфстайл",
    dark: false,
    bg: "FFF4EC",
    surface: "FFFFFF",
    text: "2B1630",
    muted: "7D5F73",
    accent: "FF4F6D",
    accent2: "FF9A3D",
    onAccent: "FFFFFF",
    border: "F3D9CF",
    series: ["FF4F6D", "FF9A3D", "B65CF0", "FFC56B", "D98BA8", "F3D9CF"],
    headingFont: stack("Rubik"),
    bodyFont: stack("Rubik"),
    webFonts: ["Rubik:wght@400;500;600;700;800"],
    pptxHeadingFont: "Trebuchet MS",
    pptxBodyFont: "Arial",
    headingWeight: 800,
    figureWidth: 0.64,
    headingTracking: -0.03,
    titleCase: "none",
    titleGradient: true,
    backdrop: "mesh",
    surfaceStyle: "glass",
    radius: 28,
    photo: "rounded",
    cover: "frame",
    list: "grid",
  },
  candy: {
    id: "candy",
    name: "Карамель",
    note: "Школа, дети, игра",
    dark: false,
    bg: "FFF8E7",
    surface: "FFFFFF",
    text: "1F1A3D",
    muted: "57517A",
    accent: "6C4CF5",
    accent2: "FF6FB5",
    onAccent: "FFFFFF",
    border: "1F1A3D",
    series: ["6C4CF5", "FF6FB5", "22C3A6", "FFB020", "3BA0FF", "FF7A45"],
    headingFont: stack("Nunito"),
    bodyFont: stack("Nunito"),
    webFonts: ["Nunito:wght@500;600;700;800;900"],
    pptxHeadingFont: "Verdana",
    pptxBodyFont: "Verdana",
    headingWeight: 900,
    figureWidth: 0.64,
    headingTracking: -0.02,
    titleCase: "none",
    titleGradient: false,
    backdrop: "confetti",
    surfaceStyle: "brutal",
    radius: 24,
    photo: "rounded",
    cover: "frame",
    list: "grid",
  },
  steppe: {
    id: "steppe",
    name: "Степь",
    note: "Казахстан, история, наследие",
    dark: true,
    bg: "0A1F3D",
    surface: "102A50",
    text: "F5F8FF",
    muted: "A8BBD9",
    accent: "F2C14E",
    accent2: "2EC4D6",
    onAccent: "0A1F3D",
    border: "23416E",
    series: ["F2C14E", "2EC4D6", "F7DC94", "A8BBD9", "5D7BA8", "2C4A78"],
    headingFont: stack("Montserrat"),
    bodyFont: stack("Montserrat"),
    webFonts: ["Montserrat:wght@400;500;600;700;800;900"],
    pptxHeadingFont: "Arial",
    pptxBodyFont: "Arial",
    headingWeight: 800,
    figureWidth: 0.74,
    headingTracking: 0.005,
    titleCase: "upper",
    titleGradient: false,
    backdrop: "ornament",
    surfaceStyle: "panel",
    radius: 16,
    photo: "arch",
    cover: "arch",
    list: "alternate",
  },
  ocean: {
    id: "ocean",
    name: "Океан",
    note: "Корпорации, финансы, отчёты",
    dark: false,
    bg: "FFFFFF",
    surface: "F2F7FD",
    text: "0B1F3A",
    muted: "4F6584",
    accent: "1F6FEB",
    accent2: "22B8CF",
    onAccent: "FFFFFF",
    border: "DCE6F2",
    series: ["1F6FEB", "22B8CF", "7AA7F5", "0B1F3A", "9DB3CF", "DCE6F2"],
    headingFont: stack("Golos Text"),
    bodyFont: stack("Golos Text"),
    webFonts: ["Golos Text:wght@400;500;600;700;800"],
    pptxHeadingFont: "Calibri",
    pptxBodyFont: "Calibri",
    headingWeight: 700,
    figureWidth: 0.62,
    headingTracking: -0.025,
    titleCase: "none",
    titleGradient: false,
    backdrop: "waves",
    surfaceStyle: "soft",
    radius: 16,
    photo: "rounded",
    cover: "frame",
    list: "rows",
  },
}

export const THEME_IDS = [...THEME_ID_LIST] as ThemeId[]

export const DEFAULT_THEME: ThemeId = "obsidian"

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DECK_THEMES, value)
}

export function deckTheme(id: unknown): DeckTheme {
  return DECK_THEMES[isThemeId(id) ? id : DEFAULT_THEME]
}

/** Every web font any theme uses, as one Google Fonts stylesheet address. */
export function deckFontsHref(themes: ThemeId[] = THEME_IDS) {
  const families = new Set<string>()
  for (const id of themes) for (const family of DECK_THEMES[id].webFonts) families.add(family)
  const query = [...families].map((family) => `family=${family.replace(/ /g, "+")}`).join("&")
  return `https://fonts.googleapis.com/css2?${query}&display=swap`
}

/* ---------------------------------------------------------- choosing one */

/**
 * The theme a topic calls for, decided from its words. The planner model can
 * suggest a theme too (the outline's "theme"); this is the fallback and the
 * tie-breaker, and it is what "Auto" means when the model said nothing.
 *
 * Order matters: the first rule that matches wins, so specific subjects
 * (a children's lesson, Kazakh history) are tested before broad ones
 * (education, history).
 *
 * A rule is a list of word stems; a stem only counts at the start of a word,
 * so "рост" (growth) is found in "рост выручки" but not inside "просто", and
 * "еда" is food but not the end of "победа". (A word boundary cannot be used:
 * it does not see Cyrillic letters.) "$" at the end of a stem means a whole word.
 */
const NOT_LETTER = "[^\\p{L}\\p{N}]"
function rule(stems: string[]) {
  const words = stems.map((stem) => (stem.endsWith("$") ? `${stem.slice(0, -1)}(?=$|${NOT_LETTER})` : stem))
  return new RegExp(`(?:^|${NOT_LETTER})(?:${words.join("|")})`, "iu")
}

const THEME_RULES: Array<[ThemeId, RegExp]> = [
  ["candy", rule(["школ", "урок", "класс", "дети", "детск", "детей", "ученик", "малыш", "детсад", "kids?$", "children", "lesson", "classroom", "балалар", "сабақ", "мектеп"])],
  ["cyber", rule(["кибер", "хакат", "хакер", "гейм", "игров", "киберспорт", "крипт", "блокчейн", "nft$", "web3", "метавсел", "cyber", "hack", "gaming", "esport", "crypto", "blockchain"])],
  // A city alone (Almaty, Astana) is not a reason for the heritage style.
  ["editorial", rule(["мод[аыуе]$", "fashion", "журнал", "медиа", "искусств", "художник", "выставк", "фотограф", "кино$", "фильм", "музык", "editorial", "magazine", "art$", "gallery"])],
  ["steppe", rule(["казах", "қазақ", "абылай", "кенесар", "абай$", "хан$", "ханств", "кочев", "степь", "степи", "степн", "наури", "юрт", "алаш", "тюрк", "золотая орда", "kazakh", "nomad", "steppe", "культур", "наслед"])],
  ["royal", rule(["люкс", "премиум", "роскош", "ювелир", "элитн", "бутик", "отел", "резиденц", "недвижимост", "luxury", "premium", "jewel", "real estate", "hotel", "wedding", "свадьб"])],
  ["forest", rule(["эколог", "природ", "климат", "лес", "агро", "ферм", "органик", "устойчив", "зелён", "зелен", "переработ", "eco", "green", "climate", "nature", "sustainab", "farm", "forest"])],
  ["sand", rule(["кофе", "кофейн", "ресторан", "кафе$", "кафешк", "пекарн", "еда$", "еды$", "кухн", "рецепт", "вин[оа]$", "ремесл", "хендмейд", "coffee", "restaurant", "bakery", "food", "cafe", "craft"])],
  ["sunset", rule(["маркетинг", "бренд", "smm$", "инстаграм", "блог", "туризм", "путешеств", "лайфстайл", "красот", "косметик", "фитнес", "йог", "marketing", "brand", "travel", "tourism", "lifestyle", "beauty", "fitness"])],
  ["ocean", rule(["отч[её]т", "квартал", "финанс", "банк", "бюджет", "выручк", "продаж", "kpi$", "аудит", "корпорат", "стратег", "медицин", "клиник", "страхов", "логистик", "report", "quarter", "finance", "bank", "budget", "revenue", "sales", "corporate", "strategy", "medical", "clinic"])],
  ["aurora", rule(["стартап", "инвест", "питч", "ии$", "ai$", "искусственн", "нейросет", "технолог", "it$", "айти", "софт", "приложен", "платформ", "saas$", "данных", "робот", "космос", "будущ", "startup", "invest", "pitch", "tech", "software", "app$", "platform", "data$", "robot", "space", "future"])],
  ["ember", rule(["запуск", "спорт", "мотивац", "энерги", "продукт", "рост$", "роста$", "launch", "sport", "energy", "growth", "motivation"])],
  ["paper", rule(["истори", "наук", "научн", "исследован", "лекци", "университет", "диплом", "курсов", "history", "science", "research", "lecture", "university", "thesis"])],
]

const TONE_THEME: Record<DeckTone, ThemeId> = {
  confident: "aurora",
  friendly: "sunset",
  academic: "paper",
  bold: "ember",
}

export function pickTheme(topic: string, tone: DeckTone = "confident"): ThemeId {
  const text = String(topic || "")
  for (const [theme, rule] of THEME_RULES) if (rule.test(text)) return theme
  return TONE_THEME[tone] || DEFAULT_THEME
}

/** Another theme that suits a deck as well as the current one: "shuffle". */
export function nextTheme(current: ThemeId, step = 1): ThemeId {
  const at = THEME_IDS.indexOf(current)
  return THEME_IDS[(at + step + THEME_IDS.length) % THEME_IDS.length]
}

/* ---------------------------------------------------------------- css */

const hex = (value: string) => `#${value}`

/** CSS custom properties for the web renderer. */
export function themeCssVariables(theme: DeckTheme): Record<string, string> {
  return {
    "--deck-bg": hex(theme.bg),
    "--deck-surface": hex(theme.surface),
    "--deck-text": hex(theme.text),
    "--deck-muted": hex(theme.muted),
    "--deck-accent": hex(theme.accent),
    "--deck-accent-2": hex(theme.accent2),
    "--deck-on-accent": hex(theme.onAccent),
    "--deck-border": hex(theme.border),
    "--deck-heading-font": theme.headingFont,
    "--deck-body-font": theme.bodyFont,
    "--deck-label-font": theme.labelFont || theme.bodyFont,
    "--deck-heading-weight": String(theme.headingWeight),
    "--deck-heading-tracking": `${theme.headingTracking}em`,
    "--deck-radius": `${theme.radius}px`,
    "--deck-series-1": hex(theme.series[0]),
    "--deck-series-2": hex(theme.series[1]),
    "--deck-series-3": hex(theme.series[2]),
  }
}
