import { runStrictMalikModel } from "@/lib/server/malik-model-router"
import type { ImageMode } from "./types"

/**
 * Turns what the user actually wrote into what an image model can actually draw.
 *
 * The previous pipeline wrapped every request in a contract:
 *
 *   AUTHORITATIVE USER REQUEST — RENDER IT LITERALLY: …
 *   NON-NEGOTIABLE VISUAL FACTS: PRIMARY SUBJECT — MUST APPEAR: …
 *   MUST NOT INCLUDE: random portrait, watermark, random text …
 *   FIDELITY RULE: subject, count and action are more important than beauty …
 *
 * A diffusion model is not a chat model. It has no notion of a rule, a
 * requirement or a prohibition — it renders the tokens it is given. So that
 * block did two harmful things at once: it buried the actual subject under two
 * hundred words of English boilerplate, and it fed the model the words
 * "AUTHORITATIVE", "RULE", "OUTPUT", "MUST NOT" — which flux happily draws into
 * the picture as text. Random-looking images and pictures full of caption text
 * were not a bug in the provider; they were the prompt.
 *
 * What actually works is short and boring:
 *
 *   1. strip the command and the conversational filler,
 *   2. translate Russian/Kazakh/mixed/typo'd input into ONE faithful English
 *      scene description that adds nothing,
 *   3. send only that description, and put every "no text, no watermark" wish
 *      in the provider's own negative_prompt field where negation belongs.
 */

// Free-tier models only, so understanding never depends on the user's plan.
// Tried in order until one returns a usable description.
const TRANSLATION_MODELS = ["malik-27b", "malik-fast-120b", "malik-20b"] as const
const MAX_SOURCE_LENGTH = 900
const MAX_DESCRIPTION_LENGTH = 600

/**
 * Negation only works in a dedicated negative field. Everything here is a thing
 * we do not want rendered — including the caption text the old prompt caused.
 */
export const IMAGE_NEGATIVE_PROMPT = [
  "text", "caption", "subtitles", "letters", "words", "typography",
  "watermark", "signature", "logo", "username",
  "frame", "border", "collage", "split image", "grid", "multiple panels", "diptych",
  "deformed hands", "extra fingers", "extra limbs", "mutated", "disfigured",
  "lowres", "low quality", "jpeg artifacts", "oversaturated",
].join(", ")

/**
 * `\b` is defined over [A-Za-z0-9_], so it never matches beside a Cyrillic
 * letter: /\bсгенерируй\b/ silently does nothing on Russian input. These are
 * the boundaries that do work, and they still keep "фотограф" out of "фото".
 */
const OPEN = "(?:^|[^\\p{L}\\p{N}])"
const CLOSE = "(?![\\p{L}\\p{N}])"
const filler = (words: string) => new RegExp(`${OPEN}(?:${words})${CLOSE}`, "giu")

/** Conversational wrappers a user types around the actual picture they want. */
const FILLER = [
  /^\s*(?:пожалуйста|плиз|плз|please)[,\s]+/giu,
  filler("с?генерируй|сгенерируйте|сгенери|генерация|нарисуй|нарисуйте|создай|создайте|сделай|сделайте|покажи|покажите|хочу|нужно|надо|давай|можешь|сможешь"),
  filler("мне|для\\s+меня"),
  filler("сурет|суретті|суретін|жаса|жасап\\s*бер|салып\\s*бер|керек"),
  // A word for "photo" is filler only when a description follows it.
  new RegExp(`${OPEN}(?:фото|фотку|фотографию|фотография|картинку|картинка|изображение|рисунок|пикчу|арт)${CLOSE}\\s+(?=[\\p{L}])`, "giu"),
  /(?:^|[^\p{L}\p{N}])(?:generate|create|draw|make|render|show)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo)?\s*(?:of\s+)?/giu,
]

export function normalizeVisualRequest(raw: string) {
  let text = String(raw || "").replace(/\s+/g, " ").trim()

  // Strip the transport command if it survived to here.
  text = text.replace(/^\s*\/(?:image|img|photo|foto|фото|картинка)\s*:?\s*/iu, "")

  for (const pattern of FILLER) text = text.replace(pattern, " ")

  return text.replace(/\s+/g, " ").replace(/^[\s,.:;–—-]+/, "").trim().slice(0, MAX_SOURCE_LENGTH)
}

/** Anything an image model reads better after translation. */
function hasNonLatinLetters(value: string) {
  return /[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Han}\p{Script=Hangul}]/u.test(value)
}

/**
 * The model is asked for a description, so anything that reads like an answer,
 * a refusal or a leftover instruction is rejected in favour of the raw request.
 */
function usableDescription(value: string, source: string) {
  const text = String(value || "").trim()
  if (text.length < 3) return false
  if (text.length > MAX_DESCRIPTION_LENGTH) return false
  if (/[Ѐ-ӿ]/u.test(text)) return false
  if (/^(?:sure|okay|ok|here|i\s|as an ai|sorry|cannot|can't)\b/i.test(text)) return false
  if (/\b(?:MUST|SHALL|DO NOT|NEVER|RULE|OUTPUT|PROMPT|REQUEST)\b/.test(text)) return false
  if (/^["'`]|["'`]$/.test(text) && text.length < 8) return false

  // A translation that collapsed the request has thrown away the parts that
  // made the picture the user's: "рыжий кот на подоконнике" must not come back
  // as "cat". English runs about as long as Russian for the same scene, so a
  // sharply shorter answer means content was dropped, not compressed.
  const sourceWords = source.split(/\s+/).filter(Boolean).length
  const textWords = text.split(/\s+/).filter(Boolean).length
  if (sourceWords >= 3 && textWords < 2) return false
  if (sourceWords >= 8 && textWords * 2 < sourceWords) return false

  return true
}

const TRANSLATION_SYSTEM_PROMPT = [
  "You rewrite a user's image request as one English scene description for an image generator.",
  "The user may write in Russian, Kazakh, English or a mix, with typos, slang and missing accents. Understand it anyway.",
  "Keep every subject, number, colour, clothing, action, place, weather and time of day the user named.",
  "Add nothing: no styles, no camera settings, no lighting, no quality words, no extra objects or people the user did not name.",
  "Never write instructions, rules, labels, quotes or explanations. Output only the description itself, as plain prose.",
].join(" ")

/**
 * Every free text model gets a turn before the request is sent untranslated.
 *
 * One model is not enough here: heavy accents, Kazakh, transliteration and
 * typos are exactly the input a single model is most likely to fumble, and a
 * fumble means the picture is wrong. If the first model answers with a refusal,
 * chatter, untranslated text or a collapsed one-word summary, the next one
 * tries the same request.
 */
async function translateToEnglish(source: string): Promise<{ text: string; translated: boolean; model: string }> {
  if (!source || !hasNonLatinLetters(source)) return { text: source, translated: false, model: "" }

  for (const modelId of TRANSLATION_MODELS) {
    try {
      const result = await runStrictMalikModel({
        modelId,
        prompt: source,
        systemPrompt: TRANSLATION_SYSTEM_PROMPT,
        maxTokens: 160,
        temperature: 0,
      })

      const candidate = String(result?.content || "")
        .replace(/\s+/g, " ")
        .replace(/^["'`\s]+|["'`\s]+$/g, "")
        .trim()

      if (usableDescription(candidate, source)) return { text: candidate, translated: true, model: modelId }
    } catch {
      // This model is down or refused. Try the next one.
    }
  }

  // Faithful original beats a mangled rewrite: flux handles some Cyrillic, and
  // the user's own words are still the closest thing to what they asked for.
  return { text: source, translated: false, model: "" }
}

/** Two or three words at most, and only when the caller explicitly chose a look. */
function modeSuffix(mode?: ImageMode) {
  if (mode === "cinematic") return "cinematic photograph"
  if (mode === "realistic") return "realistic photograph"
  if (mode === "product") return "studio product photograph"
  if (mode === "design") return "graphic design illustration"
  return ""
}

export type VisualPrompt = {
  /** Sent to the image model, and nothing else is. */
  prompt: string
  negativePrompt: string
  /** What Malik understood, shown to the user before the picture arrives. */
  understood: string
  /** The user's request after cleanup, for diagnostics and the chat card. */
  source: string
  translated: boolean
  model: string
}

/**
 * A description the client already obtained from the understand step. It is
 * validated rather than trusted: the round trip must not become a way to inject
 * arbitrary text into the image prompt.
 */
export function acceptUnderstoodDescription(value: unknown, source: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  if (!text) return ""
  return usableDescription(text, source) ? text.slice(0, MAX_DESCRIPTION_LENGTH) : ""
}

export async function buildVisualPrompt(
  rawPrompt: string,
  mode?: ImageMode,
  understoodInput?: string,
): Promise<VisualPrompt> {
  const source = normalizeVisualRequest(rawPrompt)
  if (!source) {
    return { prompt: "", negativePrompt: IMAGE_NEGATIVE_PROMPT, understood: "", source: "", translated: false, model: "" }
  }

  // Reuse the description the user already saw. Understanding the same request
  // twice would cost a second model call and could contradict what was shown.
  const reused = acceptUnderstoodDescription(understoodInput, source)
  const { text, translated, model } = reused
    ? { text: reused, translated: true, model: "reused" }
    : await translateToEnglish(source)

  const suffix = modeSuffix(mode)

  // Description first, optional look last. No headers, no rules, no negations.
  const prompt = [text, suffix].filter(Boolean).join(", ").slice(0, MAX_DESCRIPTION_LENGTH)

  return { prompt, negativePrompt: IMAGE_NEGATIVE_PROMPT, understood: text, source, translated, model }
}
