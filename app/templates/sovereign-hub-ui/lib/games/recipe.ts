import type { GameFont, GamePlan } from "./types"

/**
 * A game is never generic: each request draws its own art style (with the
 * runtime's post-processing preset and ambient weather), and every game is
 * held to the same bar for depth and feel. The finished logic is read back
 * against that bar; a flat first version gets one polish pass (studio.ts).
 */

export const GAME_STYLES = ["neon", "pixel", "dark", "toon", "synthwave", "painterly"] as const
export type GameStyle = typeof GAME_STYLES[number]
export type GameFx = { bloom: number; vignette: number; scanlines: number; grain: number; darkness: number }

const STYLES: Record<GameStyle, { fx: GameFx; ambient: string[]; font?: GameFont; art: string }> = {
  neon: {
    fx: { bloom: 0.75, vignette: 0.35, scanlines: 0, grain: 0.04, darkness: 0 }, ambient: ["stars", "dust"], font: "tech",
    art: "Neon vector — every object drawn as glowing outlines and gradients (api.draw.glow), light trails on everything that moves, a dark field, saturated accents; enemies as distinct geometric silhouettes (triangles, hexagons, rings, spikes).",
  },
  pixel: {
    fx: { bloom: 0, vignette: 0.25, scanlines: 0.3, grain: 0, darkness: 0 }, ambient: ["dust", ""], font: "pixel",
    art: "Pixel art — every sprite from api.draw.pixels grids (8–16 px, scale 3–4) with 2–3 frame animations via api.anim, a limited palette, hard edges, square particles (square:true), tile-based worlds.",
  },
  dark: {
    fx: { bloom: 0.3, vignette: 0.55, scanlines: 0, grain: 0.08, darkness: 0.72 }, ambient: ["embers", "dust"],
    art: "Dark atmosphere — the world is lit only by api.light() sources called in draw() every frame: a light around the hero, torches, projectiles, glowing enemy eyes; silhouettes against light; tension from what lies beyond it.",
  },
  toon: {
    fx: { bloom: 0.12, vignette: 0.15, scanlines: 0, grain: 0, darkness: 0 }, ambient: ["leaves", "bubbles"], font: "round",
    art: "Bright toon — chunky rounded shapes with a darker outline, squash and stretch with api.tween on jumps, landings and hits, bouncy easing (outBack, outElastic), big expressive eyes, a bright friendly palette.",
  },
  synthwave: {
    fx: { bloom: 0.6, vignette: 0.3, scanlines: 0.15, grain: 0.06, darkness: 0 }, ambient: ["stars"], font: "tech",
    art: "Synthwave — sunset gradients, a perspective grid floor (api.project), magenta and cyan chrome accents, glow and trails, 80s arcade lettering.",
  },
  painterly: {
    fx: { bloom: 0.18, vignette: 0.3, scanlines: 0, grain: 0.07, darkness: 0 }, ambient: ["dust", "snow", "leaves"],
    art: "Soft painterly — layered parallax silhouettes drawn with gradients, soft shadows and gentle light, a natural palette, calm flowing motion.",
  },
}

const CUES: Array<[RegExp, GameStyle[]]> = [
  [/пиксел|pixel|8[- ]?бит|8[- ]?bit|ретро|retro/iu, ["pixel"]],
  [/неон|neon|синтвейв|synthwave|80-?х|80s/iu, ["neon", "synthwave"]],
  [/хоррор|horror|ужас|зомби|zombie|подзем|dungeon|подвал|тьм|dark|призрак|ghost|вампир|vampire/iu, ["dark"]],
  [/космос|космич|space|шутер|shooter|галакт|galax|астероид|asteroid|звездол|starship/iu, ["neon", "synthwave", "pixel"]],
  [/гонк|racing|race|машин|car|кибер|cyber|drive|трасс/iu, ["synthwave", "neon"]],
  [/дет|kids|ферм|farm|кот|cat|собак|dog|конфет|candy|мил|cute|пазл|puzzle|три в ряд|match/iu, ["toon", "painterly"]],
  [/фэнтези|fantasy|rpg|рпг|рыцар|knight|дракон|dragon|маг|magic|меч|sword/iu, ["dark", "painterly", "pixel"]],
  [/платформ|platform|марио|mario|прыг|jump|раннер|runner/iu, ["pixel", "toon"]],
]

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** This request's art style, post-processing preset and ambient weather. */
export function gameStyleFor(prompt: string): { style: GameStyle; fx: GameFx; ambient: string; font?: GameFont } {
  const text = String(prompt || "")
  const seed = hash(text.trim().toLowerCase())
  const options = CUES.find(([pattern]) => pattern.test(text))?.[1] || [...GAME_STYLES]
  const style = options[seed % options.length]
  const spec = STYLES[style]
  return { style, fx: { ...spec.fx }, ambient: spec.ambient[(seed >>> 8) % spec.ambient.length], font: spec.font }
}

/** The plan with the style applied: the runtime reads theme.style and theme.fx from the page. */
export function withGameStyle(plan: GamePlan, prompt: string): GamePlan {
  const look = gameStyleFor(prompt)
  return { ...plan, theme: { ...plan.theme, style: look.style, fx: look.fx, ambient: look.ambient, ...(look.font ? { font: look.font } : {}) } }
}

/** What the programmer is held to: this game's art direction, depth and feel. */
export function gameRecipeText(prompt: string, plan: GamePlan): string {
  const style = (plan.theme.style && STYLES[plan.theme.style] ? plan.theme.style : gameStyleFor(prompt).style) as GameStyle
  const fx = plan.theme.fx || STYLES[style].fx
  const ambient = plan.theme.ambient ?? ""
  const endless = plan.levels === 0
  return [
    `ART STYLE — ${STYLES[style].art}`,
    `The runtime already applies this style's post-processing: api.fx = ${JSON.stringify(fx)}${fx.darkness ? " — so call api.light(x, y, radius, color) in draw() for the hero and every light source, or the world stays dark" : ""}. Adjust api.fx per level when it serves the mood.${ambient ? ` Start each level with api.ambient("${ambient}", 1) unless it hurts readability.` : ""}`,
    `DEPTH — a complete game, not a demo: ${endless ? "endless, with at least 6 clearly escalating waves" : `all ${plan.levels} levels distinct`}; at least 4 enemy or obstacle types introduced over time, each with its own behaviour and silhouette; 2 power-ups or pickups that change how the player plays; a mini-boss midway and a final boss with phases and api.boss(name, hp) bar; a new ability or upgrade between levels; scoring with api.combo() multipliers; a short api.slowmo moment before api.win or after the final boss.`,
    "FEEL — api.hitstop(0.04–0.07) on every hit, api.punch(0.04–0.08) on heavy hits, api.shake on damage, api.trail on projectiles and fast movers, particles on every impact and pickup, api.tween for squash and stretch and pop-ins, api.sfx on every event, invulnerability blink after damage, telegraph flashes before enemy attacks, smooth camera with api.follow when the world scrolls.",
    "ART — the hero is at least four layered shapes with a highlight and an idle animation; every enemy type has a distinct silhouette and colour; 2–3 parallax background layers drawn in draw() over the runtime backdrop; glow only on what matters; nothing important is a plain rectangle.",
    "LENGTH — write 600–900 lines: rich content, not boilerplate.",
  ].join("\n")
}

export type GameIssue = { code: string; detail: string }

/** Read the finished logic back against the bar. Problems that break the game are QA's job, not this. */
export function auditGameLogic(logic: string, plan: GamePlan): GameIssue[] {
  const code = String(logic || "")
  const issues: GameIssue[] = []
  const add = (code: string, detail: string) => issues.push({ code, detail })
  const lines = code.split("\n").filter((line) => line.trim()).length
  if (lines < 350) add("SHORT", `only ${lines} lines — a complete game with levels, enemy variety, bosses and polish needs 600–900`)
  const kinds = new Set([...code.matchAll(/(?:type|kind)\s*:\s*["'`]([\w-]+)["'`]/g)].map((m) => m[1]))
  if (kinds.size < 4) add("FEW_TYPES", `only ${kinds.size} distinct enemy/object types — introduce at least 4 enemy or obstacle types across the levels`)
  if (!/api\.boss\s*\(/.test(code)) add("NO_BOSS", "no boss: add a mini-boss midway and a final boss with phases, shown with api.boss(name, hp)")
  if (!/power|bonus|upgrade|shield|magnet|perk|pickup|бонус|усилен/i.test(code)) add("NO_POWERUPS", "no power-ups: add 2 pickups that change how the player plays")
  const feel = ["sfx", "particles", "shake", "floatText", "hitstop", "punch", "slowmo", "trail", "combo", "tween", "flash"].filter((name) => new RegExp(`api\\.${name}\\s*\\(`).test(code))
  if (feel.length < 7) add("FLAT_FEEL", `uses only ${feel.join(", ") || "none"} of the feel tools — add hitstop, punch, trails, tweens, combos and slow motion on big moments`)
  const levelVar = code.match(/start\s*\(\s*api\s*,\s*([A-Za-z_$][\w$]*)/)?.[1]
  if (plan.levels !== 0 && (!levelVar || (code.match(new RegExp(`\\b${levelVar}\\b`, "g")) || []).length < 3)) add("FLAT_LEVELS", "start(api, level) barely uses the level: make every level change enemies, layout, speed or patterns")
  if (plan.theme.fx?.darkness && !/api\.light\s*\(/.test(code)) add("NO_LIGHTS", "the dark style is set but nothing calls api.light(): light the hero, torches, shots and enemy eyes in draw()")
  return issues
}

/** One polish pass is worth it for a game that runs but is flat in two or more ways. */
export function gameNeedsPolish(issues: GameIssue[]) {
  return issues.length >= 2
}
