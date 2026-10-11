import type { MalikWebSource } from "../ai/web-research-types"
import { evidenceDate, safeEvidenceUrl, sanitizeEvidenceText } from "./evidence"

export type KnowledgeItem = MalikWebSource & { id: string; topic: string; checkedAt: string; dateKind: "publication" | "repository-update" | "unknown" }
export type ModelKnowledge = {
  name: string; developer: string; family: string; version: string | null
  announcedAt: string | null; availableAt: string | null; modalities: string[]
  capabilities: string[]; limitations: string[]; access: string[]; sourceUrls: string[]
  checkedAt: string; status: "primary-mention" | "release-announcement" | "candidate"
}
export type KnowledgeIndex = {
  schemaVersion: 1; lastAttemptAt: string; lastSuccessAt: string | null; runId: string
  items: KnowledgeItem[]; models: ModelKnowledge[]
  feeds: Record<string, { checkedAt: string; lastSuccessAt: string | null; count: number; error?: string; etag?: string; modified?: string }>
  errors: Array<{ feed: string; at: string; reason: string }>
}
export function emptyKnowledgeIndex(now: string): KnowledgeIndex {
  return { schemaVersion: 1, lastAttemptAt: now, lastSuccessAt: null, runId: "", items: [], models: [], feeds: {}, errors: [] }
}

export function validateKnowledgeIndex(value: unknown, now = Date.now()): KnowledgeIndex | null {
  if (!value || typeof value !== "object") return null
  const source = value as KnowledgeIndex
  if (source.schemaVersion !== 1 || !Array.isArray(source.items) || source.items.length > 500 || !Array.isArray(source.models) || source.models.length > 200) return null
  const lastAttemptAt = evidenceDate(source.lastAttemptAt, now)
  const lastSuccessAt = source.lastSuccessAt ? evidenceDate(source.lastSuccessAt, now) : null
  if (!lastAttemptAt || source.lastSuccessAt && !lastSuccessAt) return null
  const items = source.items.flatMap((item) => {
    if (!item || typeof item.url !== "string" || typeof item.title !== "string" || typeof item.id !== "string" || typeof item.topic !== "string") return []
    const url = safeEvidenceUrl(item.url), checkedAt = evidenceDate(item.checkedAt, now)
    if (!url || !checkedAt) return []
    return [{ ...item, id: item.id.slice(0, 100), topic: item.topic.slice(0, 60), url, domain: new URL(url).hostname, title: sanitizeEvidenceText(item.title, 180), snippet: sanitizeEvidenceText(typeof item.snippet === "string" ? item.snippet : "", 1800), publishedAt: evidenceDate(item.publishedAt, now), checkedAt, provider: typeof item.provider === "string" && /^[\w:-]{1,80}$/u.test(item.provider) ? item.provider : "unknown-feed" }]
  })
  // Registry records are validated independently; a malformed candidate cannot become a release.
  const models = source.models.flatMap((model) => {
    if (!model || typeof model.name !== "string" || typeof model.developer !== "string" || !Array.isArray(model.sourceUrls)) return []
    const checkedAt = evidenceDate(model.checkedAt, now)
    const sourceUrls = model.sourceUrls.filter((url) => typeof url === "string").map(safeEvidenceUrl).filter(Boolean) as string[]
    if (!checkedAt || !sourceUrls.length) return []
    const textArray = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 12).map((v) => sanitizeEvidenceText(v, 250)) : []
    const announcedAt = evidenceDate(model.announcedAt, now) || null
    return [{ name: sanitizeEvidenceText(model.name, 120), developer: sanitizeEvidenceText(model.developer, 80), family: typeof model.family === "string" ? sanitizeEvidenceText(model.family, 60) : "", version: typeof model.version === "string" ? model.version.slice(0, 40) : null, announcedAt, availableAt: evidenceDate(model.availableAt, now) || null, modalities: textArray(model.modalities), capabilities: textArray(model.capabilities), limitations: textArray(model.limitations), access: textArray(model.access), sourceUrls: sourceUrls.slice(0, 8), checkedAt, status: model.status === "release-announcement" && announcedAt ? "release-announcement" : model.status === "primary-mention" ? "primary-mention" : "candidate" } as ModelKnowledge]
  })
  const feeds: KnowledgeIndex["feeds"] = {}
  if (source.feeds && typeof source.feeds === "object" && !Array.isArray(source.feeds)) for (const [id, feed] of Object.entries(source.feeds).slice(0, 64)) {
    if (!feed || typeof feed !== "object" || !/^[\w-]{1,80}$/u.test(id)) continue
    const checkedAt = evidenceDate(feed.checkedAt, now)
    if (!checkedAt) continue
    feeds[id] = { checkedAt, lastSuccessAt: evidenceDate(feed.lastSuccessAt, now) || null, count: Number.isInteger(feed.count) && feed.count >= 0 ? Math.min(500, feed.count) : 0, ...(typeof feed.error === "string" ? { error: sanitizeEvidenceText(feed.error, 120) } : {}), ...(typeof feed.etag === "string" && !/[\r\n]/u.test(feed.etag) ? { etag: feed.etag.slice(0, 300) } : {}), ...(typeof feed.modified === "string" && !/[\r\n]/u.test(feed.modified) ? { modified: feed.modified.slice(0, 100) } : {}) }
  }
  const errors = Array.isArray(source.errors) ? source.errors.slice(-50).flatMap(error => error && typeof error.feed === "string" && typeof error.reason === "string" && evidenceDate(error.at, now) ? [{ feed: sanitizeEvidenceText(error.feed, 80), at: evidenceDate(error.at, now)!, reason: sanitizeEvidenceText(error.reason, 120) }] : []) : []
  return { schemaVersion: 1, lastAttemptAt, lastSuccessAt: lastSuccessAt || null, runId: String(source.runId || "").slice(0, 100), items, models, feeds, errors }
}

export function knowledgeHealth(index: KnowledgeIndex | null, now = Date.now()) {
  const last = index?.lastSuccessAt ? Date.parse(index.lastSuccessAt) : NaN
  return { status: !index ? "unavailable" : !Number.isFinite(last) || now - last > 48 * 3_600_000 ? "stale" : "fresh", lastSuccessAt: index?.lastSuccessAt || null, ageMs: Number.isFinite(last) ? now - last : null, items: index?.items.length || 0, models: index?.models.length || 0, failedFeeds: Object.values(index?.feeds || {}).filter((feed) => feed.error).length }
}

export function retrieveKnowledge(index: KnowledgeIndex | null, prompt: string, now = Date.now()): MalikWebSource[] {
  if (!index) return []
  const terms = prompt.toLowerCase().match(/[\p{L}\p{N}.]{3,}/gu) || []
  const ai = /ИИ|AI|LLM|модел|model|жасанды|ЖИ/iu.test(prompt)
  const kazakhstan = /казахстан|қазақстан|kazakhstan/iu.test(prompt)
  return index.items.map((item) => {
    const text = `${item.title} ${item.snippet || ""} ${item.url}`.toLowerCase()
    const hits = terms.filter((term) => text.includes(term)).length
    const topic = ai && item.topic === "ai" || kazakhstan && item.topic === "kazakhstan"
    const age = now - Date.parse(item.checkedAt)
    return { item, score: hits * 3 + (topic ? 2 : 0), valid: age >= 0 && age <= 48 * 3_600_000 }
  }).filter((row) => row.valid && row.score >= 2).sort((a, b) => b.score - a.score).slice(0, 8).map((row) => ({ ...row.item, provider: "verified-index" }))
}

const DEVELOPERS = [
  ["OpenAI", /(?:GPT(?:-oss)?|o[134])[- .]?\d[\w.-]*/giu], ["Anthropic", /Claude(?:[- ](?:Opus|Sonnet|Haiku))?[- ]?\d[\w.-]*(?:[- ](?:Opus|Sonnet|Haiku))?/giu],
  ["Google DeepMind", /(?:Gemini|(?:Embedding)?Gemma)[- ]\d[\w.-]*(?:[- ](?:Pro|Flash|Ultra|Nano|Lite))?/giu], ["Meta", /Llama[- ]\d[\w.-]*/giu],
  ["DeepSeek", /DeepSeek[- ](?:V|R)?\d[\w.-]*/giu], ["Alibaba Qwen", /Qwen[- ]?\d[\w.-]*/giu], ["Mistral", /(?:Mistral|Mixtral|Codestral|Magistral)(?:[- ](?:Small|Medium|Large))?(?:[- ]\d[\w.-]*)?/giu], ["xAI", /Grok[- ]\d[\w.-]*/giu],
] as const
export function modelsFromItems(items: readonly KnowledgeItem[]): ModelKnowledge[] {
  const records = new Map<string, ModelKnowledge>()
  const rank = { candidate: 0, "primary-mention": 1, "release-announcement": 2 }
  const add = (item: KnowledgeItem, developer: string, name: string, repository = false) => {
    const key = developer + "|" + name.toLowerCase().replace(/[- ]/gu, "")
    const primary = item.authority === "primary"
    const announcement = !repository && primary && item.dateKind === "publication" && Boolean(item.publishedAt) && /introduc|announc|releas|launch|представ|выпуст|анонс/iu.test(item.title + " " + (item.snippet || "")) && !/rumor|слух|ожидается|will launch|coming soon/iu.test(item.title)
    const next: ModelKnowledge = { name, developer, family: name.split(/[- .]/u)[0], version: name.match(/\d[\w.-]*/u)?.[0] || null, announcedAt: announcement ? item.publishedAt! : null, availableAt: null, modalities: [], capabilities: [], limitations: [], access: [], sourceUrls: [item.url], checkedAt: item.checkedAt, status: announcement ? "release-announcement" : primary ? "primary-mention" : "candidate" }
    const previous = records.get(key)
    const preferred = previous && rank[previous.status] >= rank[next.status] ? previous : next
    records.set(key, { ...preferred, sourceUrls: [...new Set([...(previous?.sourceUrls || []), item.url])].slice(0, 8), checkedAt: [previous?.checkedAt || "", item.checkedAt].sort().at(-1)!, announcedAt: previous?.announcedAt && next.announcedAt ? [previous.announcedAt, next.announcedAt].sort()[0] : preferred.announcedAt })
  }
  for (const item of items) {
    const repository = item.domain === "huggingface.co" && item.dateKind === "repository-update"
    let recognized = false
    for (const [developer, pattern] of DEVELOPERS) {
      pattern.lastIndex = 0
      // A headline/model repository identifies a candidate; arbitrary numbers in article bodies do not.
      for (const match of item.title.matchAll(pattern)) {
        recognized = true; add(item, developer, match[0], repository)
      }
    }
    // Future model names need not match a known family. Repository ownership is
    // a candidate identity, never proof of an official announcement or release.
    if (repository && !recognized) {
      const [owner, name] = new URL(item.url).pathname.slice(1).split("/")
      const developer = ({ openai: "OpenAI", google: "Google DeepMind", "meta-llama": "Meta", "deepseek-ai": "DeepSeek", Qwen: "Alibaba Qwen", mistralai: "Mistral" } as Record<string, string>)[owner] || owner
      if (owner && name) add(item, developer, name, true)
    }
  }
  return [...records.values()].slice(0, 200)
}
