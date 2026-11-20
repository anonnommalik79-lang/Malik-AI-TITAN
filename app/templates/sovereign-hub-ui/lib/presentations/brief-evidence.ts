import type { ChartSlide } from "@/lib/presentations/types"

const NUMBER = /(?<![\p{L}\p{N}])[-+−]?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d+)?(?:[eE][+-]?\d+)?(?!\d)/gu
const SLIDE_COUNT = /\b\d{1,3}\s*-?\s*(?:slides?\b|слайд\p{L}*|бет(?:тік|тен|ке|ті|тер)?(?!\p{L}))/giu

function numbers(value: string) {
  return [...value.matchAll(NUMBER)].map(([raw]) => Number(raw.replace(/\s/g, "").replace("−", "-").replace(",", "."))).filter(Number.isFinite)
}

function labelKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

function labelledValues(source: string) {
  const values = new Map<string, number | null>()
  for (const line of source.split(/[;\n]/u)) {
    const row = line.match(/^\s*\|\s*([^|]+)\|\s*([^|]+)\|?\s*$/u) ?? line.match(/^\s*([^:=|]{1,50})[:=]\s*(.+)$/u)
    if (!row) continue
    const found = numbers(row[2])
    const key = labelKey(row[1])
    if (!key || found.length !== 1) continue
    const current = values.get(key)
    values.set(key, current !== undefined && current !== found[0] ? null : found[0])
  }
  return values
}

export function briefHasChartValues(brief: string) {
  return numbers(brief.replace(SLIDE_COUNT, "")).length >= 2
}

/** Match the numbers, and preserve label/value association for a supplied table or list. */
export function chartEvidenceError(slide: ChartSlide, brief: string): string | null {
  const text = brief.replace(SLIDE_COUNT, "")
  const supplied = new Set(numbers(text))
  const labels = labelledValues(text)
  const output = new Set<string>()
  for (const { label, value } of slide.data) {
    const key = labelKey(label)
    if (!key || output.has(key)) return "Use distinct, non-empty chart labels."
    output.add(key)
    const paired = labels.get(key)
    if (paired !== undefined && paired !== null && paired !== value) return `Use the supplied value for ${JSON.stringify(label)}.`
    if (!supplied.has(value)) return "A chart value is absent from the user's data. Copy the provided values without rounding."
  }
  return null
}

export function presentationWithoutPhotos(brief: string) {
  return /(?:без (?:фото(?:графий|к)?|картинок|изображений|иллюстраций)(?!\p{L})|только текст|\b(?:no|without) (?:photos|images|pictures|illustrations)\b|суретсіз|фотосыз)/iu.test(brief)
}

export function presentationWithoutCover(brief: string) {
  return /(?:без (?:обложки|титульного слайда|титульника)|\b(?:no|without) (?:a )?(?:cover|title slide)\b|мұқабасыз)/iu.test(brief)
}
