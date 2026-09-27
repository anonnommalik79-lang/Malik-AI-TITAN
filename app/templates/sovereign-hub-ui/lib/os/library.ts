import type { ArtifactIndexEntry } from "./store"
import type { ArtifactKind } from "./types"

/**
 * The universal library: every artifact of every project, searchable by
 * meaning and connected by lineage (what was made from what, which versions
 * replaced which).
 *
 * Search is a Russian/Kazakh/English-aware keyword ranking with stems,
 * synonyms and typo tolerance. When an embedding model is configured the
 * best candidates are re-ranked by vector similarity, and the response says
 * which mode ran.
 */

const SYNONYMS: string[][] = [
  ["сайт", "лендинг", "website", "landing", "веб", "страница", "сайтқа"],
  ["презентация", "презентацию", "deck", "питч", "pitch", "слайды", "слайд", "инвестор"],
  ["логотип", "logo", "знак", "эмблема", "изображение", "картинка", "image", "сурет"],
  ["бизнес-план", "бизнес", "план", "финансы", "финансовый", "business", "plan", "юнит"],
  ["исследование", "рынок", "анализ", "research", "market", "конкуренты", "нарық"],
  ["видео", "ролик", "сценарий", "video", "script"],
  ["код", "проект", "приложение", "code", "app", "files"],
  ["бренд", "название", "brand", "айдентика", "слоган"],
  ["данные", "таблица", "csv", "xlsx", "excel", "dataset"],
]

const SYNONYM_OF = new Map<string, number>()
SYNONYMS.forEach((group, index) => group.forEach((word) => SYNONYM_OF.set(stem(word), index)))

/** Crude stemming: drops common Russian/Kazakh/English endings. */
export function stem(word: string) {
  const w = word.toLowerCase().replace(/ё/g, "е")
  if (w.length <= 4) return w
  return w
    .replace(/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ией|ий|ый|ой|ая|яя|ое|ее|ые|ие|ах|ях|ов|ев|ом|ем|ам|ям|ую|юю|ть|ся|сь|ия|ию|ие|ь|а|я|ы|и|у|ю|е|о)$/u, "")
    .replace(/(?:лар|лер|дар|дер|тар|тер|ның|нің|ға|ге|қа|ке)$/u, "")
    .replace(/(?:ing|ed|es|s)$/u, "")
}

export function tokens(text: string) {
  return String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((token) => token.length >= 2)
    .map(stem)
}

function trigrams(word: string) {
  const padded = `  ${word} `
  const set = new Set<string>()
  for (let i = 0; i < padded.length - 2; i += 1) set.add(padded.slice(i, i + 3))
  return set
}

function similar(a: string, b: string) {
  if (a === b) return 1
  if (a.length < 4 || b.length < 4) return 0
  const x = trigrams(a)
  const y = trigrams(b)
  let shared = 0
  for (const gram of x) if (y.has(gram)) shared += 1
  return shared / Math.max(x.size, y.size)
}

export type SearchFilters = { kind?: ArtifactKind; projectId?: string; limit?: number }

export type SearchHit = ArtifactIndexEntry & { relevance: number }

export function lexicalSearch(index: ArtifactIndexEntry[], query: string, filters: SearchFilters = {}): SearchHit[] {
  const pool = index.filter((entry) => (!filters.kind || entry.kind === filters.kind) && (!filters.projectId || entry.projectId === filters.projectId))
  const queryTokens = [...new Set(tokens(query))]
  const limit = Math.max(1, Math.min(100, filters.limit || 30))
  if (!queryTokens.length) return pool.slice(0, limit).map((entry) => ({ ...entry, relevance: 0 }))
  const groups = new Set(queryTokens.map((token) => SYNONYM_OF.get(token)).filter((group): group is number => group !== undefined))
  const newest = Math.max(...pool.map((entry) => entry.createdAt), 1)

  const scored = pool.map((entry) => {
    const titleTokens = tokens(entry.title)
    const bodyTokens = tokens(`${entry.summary} ${entry.keywords}`)
    let score = 0
    for (const token of queryTokens) {
      if (titleTokens.includes(token)) score += 3
      else if (bodyTokens.includes(token)) score += 1.5
      else {
        const fuzzy = Math.max(0, ...titleTokens.map((word) => similar(token, word)), ...bodyTokens.slice(0, 120).map((word) => similar(token, word) * 0.7))
        if (fuzzy >= 0.5) score += fuzzy * 1.4
      }
    }
    // Meaning, not spelling: "лендинг" finds a website, "deck" a presentation.
    for (const group of groups) {
      if ([...titleTokens, ...bodyTokens].some((token) => SYNONYM_OF.get(token) === group)) score += 1.2
    }
    // A little recency, never enough to beat a real match.
    if (score > 0) score += 0.3 * (entry.createdAt / newest)
    return { ...entry, relevance: Math.round(score * 100) / 100 }
  })
  return scored.filter((entry) => entry.relevance > 0).sort((a, b) => b.relevance - a.relevance).slice(0, limit)
}

export function cosine(a: number[], b: number[]) {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export type Embedder = (text: string) => Promise<number[] | null>

/**
 * Re-ranks lexical candidates by vector similarity when an embedder works.
 * Returns the mode that actually ran.
 */
export async function semanticSearch(index: ArtifactIndexEntry[], query: string, filters: SearchFilters, embed: Embedder | null, cache: Map<string, number[]>) {
  const limit = Math.max(1, Math.min(100, filters.limit || 30))
  const lexical = lexicalSearch(index, query, { ...filters, limit: 40 })
  if (!embed || !query.trim()) return { mode: "lexical" as const, hits: lexical.slice(0, limit) }
  const queryVector = await embed(query).catch(() => null)
  if (!queryVector) return { mode: "lexical" as const, hits: lexical.slice(0, limit) }
  // Candidates: the lexical matches plus the most recent items, so a match
  // by meaning with no shared word can still be found.
  const recent = index.filter((entry) => (!filters.kind || entry.kind === filters.kind) && (!filters.projectId || entry.projectId === filters.projectId)).slice(0, 30)
  const candidates = [...new Map([...lexical, ...recent.map((entry) => ({ ...entry, relevance: 0 }))].map((entry) => [entry.id, entry])).values()]
  const vectors = await Promise.all(candidates.map(async (entry) => {
    const cached = cache.get(entry.id)
    if (cached) return cached
    const vector = await embed(`${entry.title}. ${entry.summary}`.slice(0, 1_500)).catch(() => null)
    if (vector) cache.set(entry.id, vector)
    return vector
  }))
  const maxLexical = Math.max(1, ...lexical.map((hit) => hit.relevance))
  const hits = candidates
    .map((entry, index) => {
      const vector = vectors[index]
      const meaning = vector ? cosine(queryVector, vector) : 0
      return { ...entry, relevance: Math.round((meaning * 0.7 + (entry.relevance / maxLexical) * 0.3) * 1000) / 1000 }
    })
    .filter((entry) => entry.relevance > 0.2)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
  return { mode: "semantic" as const, hits }
}

export type Lineage = {
  artifact: ArtifactIndexEntry
  /** What this was made from. */
  sources: ArtifactIndexEntry[]
  /** What was made from this. */
  derived: ArtifactIndexEntry[]
  /** Every version, oldest first. */
  versions: ArtifactIndexEntry[]
}

export function lineageOf(index: ArtifactIndexEntry[], id: string): Lineage | null {
  const byId = new Map(index.map((entry) => [entry.id, entry]))
  const artifact = byId.get(id)
  if (!artifact) return null
  const sources = artifact.links.filter((link) => link.relation === "derived-from" || link.relation === "input-of").map((link) => byId.get(link.artifactId)).filter((entry): entry is ArtifactIndexEntry => Boolean(entry))
  const derived = index.filter((entry) => entry.links.some((link) => link.artifactId === id && link.relation !== "revision-of"))

  // Versions: walk back through revision-of, then forward to the newest.
  const chain: ArtifactIndexEntry[] = []
  let cursor: ArtifactIndexEntry | undefined = artifact
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    chain.unshift(cursor)
    const previous: { artifactId: string } | undefined = cursor.links.find((link) => link.relation === "revision-of")
    cursor = previous ? byId.get(previous.artifactId) : undefined
  }
  let tip: ArtifactIndexEntry | undefined = artifact
  while (tip) {
    const next = index.filter((entry) => !seen.has(entry.id) && entry.links.some((link) => link.relation === "revision-of" && link.artifactId === tip!.id)).sort((a, b) => a.createdAt - b.createdAt)[0]
    if (!next) break
    seen.add(next.id)
    chain.push(next)
    tip = next
  }
  return { artifact, sources, derived, versions: chain }
}
