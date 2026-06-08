/**
 * Kazakh Transliteration Engine
 * =============================
 * Deterministic Cyrillic ↔ Latin conversion for the Kazakh language based on
 * the 2021 Qazaq Latin alphabet (umlaut/breve version: Ә=Ä, Ғ=Ğ, Ң=Ñ, Ө=Ö,
 * Ұ=Ū, Ү=Ü, Ш=Ş, Ч=Ç, Қ=Q, Ж=J).
 *
 * This is the moat that competitors do poorly: it runs offline, instantly and
 * without any AI/API call. Forward (Cyrillic→Latin) is exact; reverse
 * (Latin→Cyrillic) is best-effort because several Cyrillic letters collapse to
 * the same Latin glyph (И/Й/І → I), so reverse uses the most common mapping.
 */

/** Cyrillic → 2021 Latin (lowercase base; case is re-applied afterwards). */
const CYR_TO_LAT: Record<string, string> = {
  а: "a", ә: "ä", б: "b", в: "v", г: "g", ғ: "ğ", д: "d", е: "e",
  ж: "j", з: "z", и: "i", й: "i", к: "k", қ: "q", л: "l", м: "m",
  н: "n", ң: "ñ", о: "o", ө: "ö", п: "p", р: "r", с: "s", т: "t",
  у: "u", ұ: "ū", ү: "ü", ф: "f", х: "h", һ: "h", ц: "ts", ч: "ç",
  ш: "ş", щ: "şş", ъ: "", ы: "y", і: "i", ь: "", э: "e", ю: "iu", я: "ia",
}

/** 2021 Latin → Cyrillic (best-effort; multi-char tokens handled first). */
const LAT_MULTI: Array<[string, string]> = [
  ["şş", "щ"],
  ["ts", "ц"],
  ["iu", "ю"],
  ["ia", "я"],
]

const LAT_TO_CYR: Record<string, string> = {
  a: "а", ä: "ә", b: "б", v: "в", g: "г", ğ: "ғ", d: "д", e: "е",
  j: "ж", z: "з", i: "и", k: "к", q: "қ", l: "л", m: "м", n: "н",
  ñ: "ң", o: "о", ö: "ө", p: "п", r: "р", s: "с", t: "т", u: "у",
  ū: "ұ", ü: "ү", f: "ф", h: "х", ç: "ч", ş: "ш", y: "ы",
  // common Latin letters with no direct Kazakh-Cyrillic single match
  c: "к", w: "у", x: "х",
}

function matchCase(source: string, target: string): string {
  if (!source) return target
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    // Fully uppercase source → uppercase target
    if (target.length > 1) {
      return target[0].toUpperCase() + target.slice(1)
    }
    return target.toUpperCase()
  }
  return target
}

/** Convert Kazakh Cyrillic text to 2021 Latin. Exact and reversible-ish. */
export function kazakhCyrillicToLatin(input: string): string {
  let out = ""
  for (const ch of input) {
    const lower = ch.toLowerCase()
    const mapped = CYR_TO_LAT[lower]
    if (mapped === undefined) {
      out += ch
      continue
    }
    out += matchCase(ch, mapped)
  }
  return out
}

/** Convert 2021 Latin Kazakh text to Cyrillic (best-effort). */
export function kazakhLatinToCyrillic(input: string): string {
  let text = input

  // Replace multi-char Latin tokens first (case-insensitive, preserve case).
  for (const [lat, cyr] of LAT_MULTI) {
    const re = new RegExp(lat, "gi")
    text = text.replace(re, (m) => matchCase(m, cyr))
  }

  let out = ""
  for (const ch of text) {
    const lower = ch.toLowerCase()
    const mapped = LAT_TO_CYR[lower]
    if (mapped === undefined) {
      out += ch
      continue
    }
    out += matchCase(ch, mapped)
  }
  return out
}

export type KazakhScript = "cyrillic" | "latin" | "mixed" | "unknown"

const CYR_KAZAKH_RE = /[а-яёәғқңөұүһі]/i
const LAT_KAZAKH_RE = /[a-zäğñöūüçş]/i
const LAT_SPECIAL_RE = /[äğñöūüçş]/i
const CYR_SPECIAL_RE = /[әғқңөұүһі]/i

/** Detect whether text is Kazakh Cyrillic, Latin, mixed, or unknown. */
export function detectKazakhScript(input: string): KazakhScript {
  const hasCyr = CYR_KAZAKH_RE.test(input)
  const hasLat = LAT_KAZAKH_RE.test(input)
  if (hasCyr && hasLat) return "mixed"
  if (hasCyr) return "cyrillic"
  if (hasLat) return "latin"
  return "unknown"
}

/** Auto: convert to the opposite Kazakh script. */
export function kazakhTransliterateAuto(input: string): { output: string; from: KazakhScript; to: KazakhScript } {
  const hasLatSpecial = LAT_SPECIAL_RE.test(input)
  const hasCyrSpecial = CYR_SPECIAL_RE.test(input)
  const script = detectKazakhScript(input)

  // Prefer the script that carries Kazakh-specific letters.
  if (hasCyrSpecial || script === "cyrillic") {
    return { output: kazakhCyrillicToLatin(input), from: "cyrillic", to: "latin" }
  }
  if (hasLatSpecial || script === "latin") {
    return { output: kazakhLatinToCyrillic(input), from: "latin", to: "cyrillic" }
  }
  // Default assume Cyrillic → Latin (most common source).
  return { output: kazakhCyrillicToLatin(input), from: "cyrillic", to: "latin" }
}
