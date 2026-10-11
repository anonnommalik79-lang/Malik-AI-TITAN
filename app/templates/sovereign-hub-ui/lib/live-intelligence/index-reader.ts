import { fetchResearchResponse } from "../malik-research/bounded-fetch"
import { knowledgeHealth, retrieveKnowledge, validateKnowledgeIndex, type KnowledgeIndex } from "./knowledge-index"

let snapshot: KnowledgeIndex | null = null
let checked = 0
let pending: Promise<KnowledgeIndex | null> | null = null
const INDEX_URL = "https://raw.githubusercontent.com/anonnommalik79-lang/Malik-AI-TITAN/knowledge/live-index/index.json"

export async function loadKnowledgeIndex(): Promise<KnowledgeIndex | null> {
  if (Date.now() - checked < (snapshot ? 15 * 60_000 : 60_000)) return snapshot
  if (pending) return pending
  pending = (async () => {
    try {
      const token = process.env.MALIK_KNOWLEDGE_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
      const url = token ? "https://api.github.com/repos/anonnommalik79-lang/Malik-AI-TITAN/contents/index.json?ref=knowledge/live-index" : INDEX_URL
      const response = await fetchResearchResponse(url, { cache: "no-store", redirect: "error", headers: token ? { Authorization: `Bearer ${token}`, accept: "application/vnd.github.raw+json" } : undefined }, 1800, 2 * 1024 * 1024)
      if (response.ok) {
        const valid = validateKnowledgeIndex(await response.json())
        if (valid) snapshot = valid
      }
    } catch { /* A missing/stale index never blocks request-time search. */ }
    finally { checked = Date.now(); pending = null }
    return snapshot
  })()
  return pending
}

export async function indexedSources(prompt: string) {
  const index = await loadKnowledgeIndex()
  return { sources: retrieveKnowledge(index, prompt), health: knowledgeHealth(index) }
}
