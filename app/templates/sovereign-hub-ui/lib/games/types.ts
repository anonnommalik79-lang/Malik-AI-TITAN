/**
 * Malik Game Studio: a request for a game becomes a playable HTML5 game in
 * the chat — not a page about a game and not a code dump that stops halfway.
 *
 * The work is split so that no single model reply has to be long:
 *   plan    — the model designs the game (a small JSON);
 *   runtime — Malik's own engine supplies everything every game needs and a
 *             model tends to get wrong or run out of room for: the loop,
 *             menus, pause, restart, HUD, lives, levels, sound, touch
 *             controls, scaling, particles, error reporting;
 *   logic   — the model writes only this game's rules and drawing, in one
 *             file with an explicit end marker, so a cut-off reply is known
 *             and continued from the exact point;
 *   QA      — syntax, a safety policy and a real run of the game in an
 *             isolated process; failures go back to the model to fix.
 */

export type GameLocale = "ru" | "kk" | "en"

export const GAME_BACKDROPS = ["space", "sky", "night", "forest", "ocean", "desert", "dungeon", "neon", "grid", "snow", "lava", "candy", "plain"] as const
export type GameBackdrop = typeof GAME_BACKDROPS[number]

export const GAME_FONTS = ["display", "pixel", "round", "tech", "serif"] as const
export type GameFont = typeof GAME_FONTS[number]

export const GAME_MOODS = ["upbeat", "tense", "calm", "epic", "none"] as const
export type GameMood = typeof GAME_MOODS[number]

export type GameInput = "keyboard" | "pointer" | "both"

export type GamePalette = {
  bg: string
  bg2: string
  fg: string
  muted: string
  accent: string
  accent2: string
  danger: string
  good: string
}

export type GameControl = { keys: string; action: string }
export type TouchButton = { id: "action" | "action2"; label: string }

export type GamePlan = {
  version: 1
  title: string
  tagline: string
  locale: GameLocale
  /** Short genre label in the person's language («космический шутер»). */
  genre: string
  input: GameInput
  width: number
  height: number
  lives: number
  /** 0 means endless: levels keep coming until the player loses. */
  levels: number
  goal: string
  lose: string
  controls: GameControl[]
  touch: { joystick: boolean; buttons: TouchButton[] }
  theme: { palette: GamePalette; backdrop: GameBackdrop; font: GameFont; mood: GameMood }
  /** Rules, enemies and levels in plain words, written for the programmer model. */
  mechanics: string[]
  entities: string[]
  levelPlan: string[]
  art: string
}

export type GameCheck = { status: "pass" | "fail" | "not_run"; details: string[] }

export type GameQa = {
  syntax: GameCheck
  policy: GameCheck
  contract: GameCheck
  /** The game really ran: frames simulated, input applied, errors caught. */
  run: GameCheck & { frames?: number; drawOpsPerFrame?: number; reactsToInput?: boolean; ended?: string }
}

export type GameResult = {
  plan: GamePlan
  logic: string
  html: string
  qa: GameQa
  /** Model calls spent: plan, writing, continuations of a cut reply, repairs. */
  calls: { plan: boolean; author: number; continuations: number; repairs: number }
  ok: boolean
}
