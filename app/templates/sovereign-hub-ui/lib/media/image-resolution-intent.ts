import type { MalikImageQuality } from "./image-quality-presets"
import { isMalikImageQuality } from "./image-quality-presets"

/**
 * Nobody opens a settings menu to ask for 8K. They type "кот в 8к".
 *
 * So the size lives in two places at once, and they mean different things:
 *
 * - as a *delivery* instruction it is exactly right, and this module reads it;
 * - as a *prompt* token it is actively harmful. "8K", like "masterpiece" and
 *   "ultra HD", appears in training data attached to stock renders, wallpaper
 *   packs and upscaler demos. Leaving it in the prompt pulls the render toward
 *   that look - glossy, over-lit, artificial - which is the opposite of what
 *   somebody asking for maximum quality wants. So the token is honoured and
 *   then removed before the model ever sees it.
 *
 * The word boundaries here are written the long way on purpose. JavaScript's
 * `\b` is ASCII-only and does not fire next to Cyrillic, so `\b8к\b` never
 * matches anything a Russian or Kazakh speaker types.
 */

const TIER_BY_NUMBER: Record<string, MalikImageQuality> = {
  "2": "ultra",
  "4": "ultra4k",
  "8": "ultra8k",
  "16": "ultra16k",
}

const RANK: Record<MalikImageQuality, number> = {
  draft: 0,
  balanced: 1,
  quality: 2,
  ultra: 3,
  ultra4k: 4,
  ultra8k: 5,
  ultra16k: 6,
}

/**
 * A digit group followed immediately by k or к, with nothing alphanumeric on
 * either side, optionally introduced by a preposition that should disappear
 * along with it.
 *
 * The letter has to touch the digits: "4 к 5" is Russian for "4 to 5" and is
 * not a resolution, while nobody writing a prompt types "8 k" with a space.
 * The trailing lookahead is what rejects "4кг" and "16кадров".
 */
const RESOLUTION_TOKEN = /(?:^|[^\p{L}\p{N}])(?:(?:в|во|на|in|at)\s+)?(16|8|4|2)[kк](?![\p{L}\p{N}])/giu

/** The unambiguous spelled-out forms. Anything vaguer is left alone. */
const NAMED_TIERS: Array<[MalikImageQuality, RegExp]> = [
  ["ultra4k", /(?:^|[^\p{L}\p{N}])(?:ultra\s*hd|uhd|юхд)(?![\p{L}\p{N}])/giu],
]

export type ResolutionIntent = {
  /** The tier the prompt asked for, or undefined when it asked for nothing. */
  quality?: MalikImageQuality
  /** The prompt with the size words taken out, ready for the model. */
  prompt: string
  /** The literal text that was recognised, for showing back to the user. */
  matched: string[]
}

function compact(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*(?=[,;:])/g, "")
    .replace(/^[\s,;:.\-–—]+/, "")
    .replace(/[\s,;:\-–—]+$/, "")
    .trim()
}

function hasContent(value: string) {
  return /[\p{L}\p{N}]/u.test(value)
}

/**
 * Reads a delivery size out of what the person actually wrote and hands back
 * the prompt without it.
 */
export function readResolutionIntent(prompt: string): ResolutionIntent {
  const source = String(prompt || "")
  if (!source.trim()) return { prompt: source, matched: [] }

  let best: MalikImageQuality | undefined
  const matched: string[] = []
  let stripped = source

  const consider = (tier: MalikImageQuality) => {
    if (!best || RANK[tier] > RANK[best]) best = tier
  }

  stripped = stripped.replace(RESOLUTION_TOKEN, (match, digits: string) => {
    const tier = TIER_BY_NUMBER[digits]
    if (!tier) return match
    consider(tier)
    matched.push(match.trim())
    // The leading boundary character was consumed by the match; a space puts a
    // separator back so "портрет 8к крупным планом" does not become one word.
    return " "
  })

  for (const [tier, pattern] of NAMED_TIERS) {
    stripped = stripped.replace(pattern, (match) => {
      consider(tier)
      matched.push(match.trim())
      return " "
    })
  }

  if (!best) return { prompt: source, matched: [] }

  // "8к" on its own is a complete request for a size and an empty request for a
  // picture. Stripping it would leave the model nothing to draw, so in that one
  // case the words stay and the tier is taken anyway.
  const cleaned = compact(stripped)
  return { quality: best, prompt: hasContent(cleaned) ? cleaned : source, matched }
}

/**
 * The tier to generate at, given what the person typed and what their settings
 * say.
 *
 * The prompt wins when it names a size. It is the more specific signal and the
 * more recent one: somebody who has 16K saved in settings and then types "4к"
 * wants this picture at 4K, and somebody who never opened settings still gets
 * what they asked for.
 */
export function resolveRequestedQuality(prompt: string, configured: unknown): {
  quality: MalikImageQuality
  prompt: string
  fromPrompt: boolean
} {
  const intent = readResolutionIntent(prompt)
  const fallback = isMalikImageQuality(configured) ? configured : "ultra"
  if (!intent.quality) return { quality: fallback, prompt: intent.prompt, fromPrompt: false }
  return { quality: intent.quality, prompt: intent.prompt, fromPrompt: true }
}
