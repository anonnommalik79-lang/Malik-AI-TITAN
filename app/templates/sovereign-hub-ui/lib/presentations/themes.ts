import type { ThemeId } from "@/lib/presentations/types"

/**
 * Six themes, written once and read by both the screen and PowerPoint.
 *
 * Every colour is a plain six-digit hex because PowerPoint accepts nothing
 * else, and keeping one source for both means a deck exported to .pptx looks
 * like the deck that was on screen rather than a cousin of it.
 *
 * Obsidian is the default and it is black and white on purpose — true
 * neutral greys, not the faintly blue zinc scale — because it is the
 * product's own look, and a monochrome deck is the one theme that is never
 * wrong. The other five exist because a presentation is the user's content,
 * not the app's chrome — a bakery's pitch should be allowed to be warm.
 */

export type DeckTheme = {
  id: ThemeId
  name: string
  dark: boolean
  bg: string
  surface: string
  text: string
  muted: string
  accent: string
  /** Text drawn on top of the accent colour. */
  onAccent: string
  border: string
  /** Bars in a chart, strongest first. */
  series: string[]
  headingFont: string
  bodyFont: string
  /** Font names PowerPoint ships with, so an exported deck never substitutes. */
  pptxHeadingFont: string
  pptxBodyFont: string
  /** Heading weight on screen; serif themes read better lighter. */
  headingWeight: number
}

const SANS = `"Inter", "SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif`
const SERIF = `"Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif`

export const DECK_THEMES: Record<ThemeId, DeckTheme> = {
  obsidian: {
    id: "obsidian",
    name: "Обсидиан",
    dark: true,
    bg: "000000",
    surface: "111111",
    text: "FFFFFF",
    muted: "A3A3A3",
    accent: "FFFFFF",
    onAccent: "000000",
    border: "2A2A2A",
    series: ["FFFFFF", "A3A3A3", "737373", "525252", "404040", "262626"],
    headingFont: SANS,
    bodyFont: SANS,
    pptxHeadingFont: "Arial",
    pptxBodyFont: "Arial",
    headingWeight: 800,
  },
  paper: {
    id: "paper",
    name: "Бумага",
    dark: false,
    bg: "FFFFFF",
    surface: "F5F5F5",
    text: "0A0A0A",
    muted: "525252",
    accent: "0A0A0A",
    onAccent: "FFFFFF",
    border: "E5E5E5",
    series: ["0A0A0A", "404040", "737373", "A3A3A3", "D4D4D4", "E5E5E5"],
    headingFont: SANS,
    bodyFont: SANS,
    pptxHeadingFont: "Arial",
    pptxBodyFont: "Arial",
    headingWeight: 800,
  },
  ember: {
    id: "ember",
    name: "Жар",
    dark: true,
    bg: "120D0B",
    surface: "1E1612",
    text: "FBF3EC",
    muted: "C9A898",
    accent: "FF6A2C",
    onAccent: "120D0B",
    border: "3A2A23",
    series: ["FF6A2C", "FF9A62", "FFC49B", "C9A898", "8A6B5C", "5A4439"],
    headingFont: SANS,
    bodyFont: SANS,
    pptxHeadingFont: "Arial",
    pptxBodyFont: "Arial",
    headingWeight: 800,
  },
  forest: {
    id: "forest",
    name: "Лес",
    dark: true,
    bg: "0D1A14",
    surface: "14261D",
    text: "EEF5EE",
    muted: "9FB9A8",
    accent: "9BE15D",
    onAccent: "0D1A14",
    border: "25402F",
    series: ["9BE15D", "C4EE9A", "6FB53A", "9FB9A8", "5E7D69", "3C5646"],
    headingFont: SANS,
    bodyFont: SANS,
    pptxHeadingFont: "Arial",
    pptxBodyFont: "Arial",
    headingWeight: 800,
  },
  sand: {
    id: "sand",
    name: "Песок",
    dark: false,
    bg: "F6EFE4",
    surface: "EDE3D3",
    text: "2A211A",
    muted: "7A6A5A",
    accent: "C2552D",
    onAccent: "FFF8F0",
    border: "DCCDB6",
    series: ["C2552D", "E08A5F", "2A211A", "7A6A5A", "B9A58C", "DCCDB6"],
    headingFont: SERIF,
    bodyFont: SANS,
    pptxHeadingFont: "Georgia",
    pptxBodyFont: "Arial",
    headingWeight: 600,
  },
  royal: {
    id: "royal",
    name: "Корона",
    dark: true,
    bg: "120C1C",
    surface: "1D142D",
    text: "F6F1FF",
    muted: "B7A8D4",
    accent: "E9C46A",
    onAccent: "120C1C",
    border: "34264C",
    series: ["E9C46A", "F2DC9E", "B7A8D4", "8C7AB0", "5F4E82", "3E3157"],
    headingFont: SERIF,
    bodyFont: SANS,
    pptxHeadingFont: "Georgia",
    pptxBodyFont: "Arial",
    headingWeight: 600,
  },
}

export const THEME_IDS = Object.keys(DECK_THEMES) as ThemeId[]

export const DEFAULT_THEME: ThemeId = "obsidian"

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && value in DECK_THEMES
}

export function deckTheme(id: unknown): DeckTheme {
  return DECK_THEMES[isThemeId(id) ? id : DEFAULT_THEME]
}

/** CSS custom properties for the web renderer. */
export function themeCssVariables(theme: DeckTheme): Record<string, string> {
  return {
    "--deck-bg": `#${theme.bg}`,
    "--deck-surface": `#${theme.surface}`,
    "--deck-text": `#${theme.text}`,
    "--deck-muted": `#${theme.muted}`,
    "--deck-accent": `#${theme.accent}`,
    "--deck-on-accent": `#${theme.onAccent}`,
    "--deck-border": `#${theme.border}`,
    "--deck-heading-font": theme.headingFont,
    "--deck-body-font": theme.bodyFont,
    "--deck-heading-weight": String(theme.headingWeight),
  }
}
