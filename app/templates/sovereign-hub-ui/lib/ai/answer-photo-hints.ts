import { allowsAnswerPhotoHints, planReferenceVisuals, referenceSearchTopic, type ReferenceVisualPlan } from "./reference-visual-policy"

type PhotoSubject = {
  name: string
  query: string
  kind: "person" | "entity" | "topic"
  layout: "portrait" | "landscape"
  /** One line under the photo in a lineup: what it is, what it includes. */
  caption?: string
}

function label(value: unknown): string {
  return typeof value === "string" && value.length <= 120 && !/[<>\n\r{}]|https?:|www\./iu.test(value)
    ? value.replace(/\s+/gu, " ").trim() : ""
}

/** Model suggestions are names only. Image URLs still come from verified catalogues. */
export function parseAnswerPhotoHints(json: string): PhotoSubject[] {
  if (json.length > 8192) return []
  try {
    const data = JSON.parse(json)
    if (data?.version !== 1 || !Array.isArray(data.subjects) || data.subjects.length > 12) return []
    return data.subjects.flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return []
      const record = item as Record<string, unknown>
      const name = label(record.name), query = label(record.query) || name
      if (name.length < 3 || query.length < 3) return []
      // A translated alias must preserve model numbers and generations.
      const numbers = (text: string) => [...new Set(text.match(/\d+/gu) || [])].sort().join(",")
      if (numbers(name) !== numbers(query)) return []
      if (/(?:iphone|айфон|galaxy|pixel)/iu.test(name)) {
        const variants = (text: string) => (text.toLowerCase().replace(/про/gu, "pro").replace(/макс/gu, "max").replace(/плюс/gu, "plus").replace(/мини/gu, "mini").replace(/ультра/gu, "ultra")
          .match(/(?<!\p{L})(?:pro|max|plus|mini|ultra|air|fold|flip)(?!\p{L})/gu) || []).sort().join(",")
        if (variants(name) !== variants(query)) return []
      }
      const caption = typeof record.caption === "string" && record.caption.length <= 160 && !/[<>{}]|https?:|www\./iu.test(record.caption)
        ? record.caption.replace(/\s+/gu, " ").trim() : ""
      return [{ name, query, kind: record.kind === "person" ? "person" as const : record.kind === "topic" ? "topic" as const : "entity" as const,
        layout: record.layout === "portrait" ? "portrait" as const : "landscape" as const, ...(caption ? { caption } : {}) }]
    })
  } catch { return [] }
}

/**
 * A head-to-head lineup: 2-4 contenders shown side by side under the opening
 * lines («Главные соперники»), the way ChatGPT opens a comparison. Only an
 * explicit layout:"lineup" fence is one - every other fence keeps its
 * subject-by-subject placement.
 */
export function isPhotoLineup(json: string): boolean {
  if (json.length > 8192) return false
  try {
    const data = JSON.parse(json)
    return data?.version === 1 && data.layout === "lineup" && Array.isArray(data.subjects) && data.subjects.length >= 2 && data.subjects.length <= 4
  } catch { return false }
}

/** Keep internal photo metadata out of copying, speech, downloads and sharing. */
export function stripAnswerPhotoHints(text: string): string {
  const lines = text.split("\n"), output: string[] = []
  let fence = false, photo = false
  for (const line of lines) {
    if (!fence && /^\s*```malik-photos\s*$/iu.test(line)) { fence = true; photo = true; continue }
    if (/^\s*```/u.test(line)) {
      if (fence && /^\s*```\s*$/u.test(line)) { fence = false; if (photo) { photo = false; continue } }
      else if (!fence) fence = true
    }
    if (!photo) output.push(line)
  }
  return output.join("\n").trim()
}

export function groundedAnswerPhotoPlans(subjects: PhotoSubject[], question: string, answer: string, hasAttachment = false): ReferenceVisualPlan[] {
  if (!allowsAnswerPhotoHints(question, hasAttachment)) return []
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[`*_]/gu, "").replace(/\s+/gu, " ")
  const visible = normalize(stripAnswerPhotoHints(answer).replace(/```[\s\S]*?(?:```|$)/gu, ""))
  const seen = new Set<string>()
  const personQuestion = Boolean(planReferenceVisuals(question)?.person)
  const eventParticipationQuestion = /(?:спикер|выступ(?:а|и|ил|ят)|участни[кц]|приехал|присутств|кто\s+будет|speaker|attend|participat|lineup|guest\s+list|қатысуш|спикер)/iu.test(question)
  const uncertainEventClaim = /(?:не\s+(?:подтвержд|значит|указан|включ[её]н|найден|объявлен)|нет\s+(?:данных|подтвержден|сведен)|неизвестно|не\s+числит|not\s+(?:listed|confirmed|announced)|no\s+(?:evidence|confirmation)|unconfirmed)/iu

  return subjects.flatMap((subject) => {
    const name = normalize(subject.name)
    // Require the complete named subject in visible prose, with word boundaries.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
    const namePattern = new RegExp("(?<![\\p{L}\\p{N}])" + escaped + "(?![\\p{L}\\p{N}])", "u")
    if (seen.has(name) || !namePattern.test(visible)) return []
    // A portrait from Wikipedia establishes identity, never participation in an event.
    if (eventParticipationQuestion) {
      const nameOffset = visible.search(namePattern)
      const mention = nameOffset >= 0 ? visible.slice(Math.max(0, nameOffset - 85), nameOffset + name.length + 110) : ""
      if (uncertainEventClaim.test(mention)) return []
    }
    seen.add(name)
    return [{ topic: subject.name, queries: [...new Set([referenceSearchTopic(subject.query), referenceSearchTopic(subject.name)])],
      explicit: true, entity: subject.kind !== "topic" || personQuestion, person: subject.kind === "person" || personQuestion, kind: "reference" as const, layout: subject.layout,
      ...(subject.caption ? { caption: subject.caption } : {}) }]
  })
}
