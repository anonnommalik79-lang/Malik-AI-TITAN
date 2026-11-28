import type { FreshnessIntent } from "../ai/freshness-intent"
import type { LiveSearchProvider } from "../live-intelligence/search-engine"
import { searchTimeFilters } from "../live-intelligence/search-time-filters"
import { assertPublicHttpUrl } from "../server/request-safety"
import { fetchResearchResponse } from "./bounded-fetch"
import type { FetchedSource, SearchResult } from "./types"
import { clampText, cleanTitle, domainOf, fetchWithTimeout, stripHtml } from "./utils"

type WebRecord = Record<string, unknown>
const object = (value: unknown): WebRecord => value && typeof value === "object" && !Array.isArray(value) ? value as WebRecord : {}
const string = (value: unknown) => typeof value === "string" ? value.trim() : ""
const parallelEndpoint = "https://mcp.parallel.ai/mcp"

function records(value: unknown) {
  return Array.isArray(value) ? value.map(object) : []
}

function parseJson(value: string) {
  try { return object(JSON.parse(value)) }
  catch { return {} }
}

export function parallelSearchEnabled() {
  return process.env.PARALLEL_MCP_DISABLED !== "true"
}

function freeTavilyKey() {
  return process.env.TAVILY_FREE_API_KEY?.trim()
}

function exaKey() {
  return process.env.EXA_FREE_API_KEY?.trim()
}

export function webSearchConfiguration() {
  return { tavily: Boolean(freeTavilyKey()), exa: Boolean(exaKey()), parallel: parallelSearchEnabled() }
}

export function freeSearchProviders() {
  const config = webSearchConfiguration()
  const keyed: LiveSearchProvider[] = [
    ...(config.tavily ? [{ name: "tavily", run: searchTavily }] : []),
    ...(config.exa ? [{ name: "exa", run: searchExa }] : []),
  ]
  const parallel: LiveSearchProvider[] = config.parallel ? [{ name: "parallel", timeoutMs: 5600, run: searchParallel }] : []
  return { primary: keyed.length ? [...keyed, ...parallel] : [], fallback: keyed.length ? [] : parallel }
}

export function legacyTavilySearchProviders(): LiveSearchProvider[] {
  return !freeTavilyKey() && process.env.TAVILY_API_KEY?.trim() ? [{ name: "tavily", run: searchTavily }] : []
}

async function parallelTool(name: "web_search" | "web_fetch", args: WebRecord, signal: AbortSignal) {
  const id = crypto.randomUUID()
  // Parallel's public tools also accept standalone calls over Streamable HTTP.
  const response = await fetchResearchResponse(parallelEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-03-26",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
    signal, redirect: "error", cache: "no-store",
  }, 5500, 512_000)
  if (!response.ok) throw new Error("Parallel MCP HTTP " + response.status)
  const body = await response.text()
  const envelope = response.headers.get("content-type")?.includes("text/event-stream")
    ? body.split(/\r?\n\r?\n/u).map(event => parseJson(event.split(/\r?\n/u)
      .filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n")))
      .find(frame => frame.id === id)
    : parseJson(body)
  if (envelope?.id !== id) return []
  const result = object(envelope.result)
  if (envelope.error || result.isError) throw new Error("Parallel MCP tool unavailable")
  const structured = object(result.structuredContent)
  if (Array.isArray(structured.results)) return records(structured.results)
  const payload = records(result.content).find(item => item.type === "text")
  return records(parseJson(string(payload?.text)).results)
}

function passages(value: unknown) {
  return Array.isArray(value) ? value.map(string).filter(Boolean).join("\n") : ""
}

function publicUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return
  try {
    const url = assertPublicHttpUrl(value)
    url.hash = ""
    return url.toString()
  } catch { return }
}

function searchSources(rows: WebRecord[], provider: string, limit: number): SearchResult[] {
  return rows.flatMap(row => {
    const url = publicUrl(row.url)
    if (!url) return []
    return [{
      title: cleanTitle(string(row.title) || url),
      url, domain: domainOf(url), provider,
      snippet: clampText(stripHtml(passages(row.excerpts) || passages(row.highlights) || string(row.content)), 4500),
      publishedAt: string(row.publish_date || row.published_date || row.publishedDate) || undefined,
      score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : undefined,
    }]
  }).slice(0, limit)
}

export async function searchParallel(query: string, limit: number, signal: AbortSignal, intent: FreshnessIntent) {
  const keywords = query.replace(/["“”«»]/gu, "").slice(0, 200).trim()
  if (!keywords) return []
  const objective = [
    "Find primary public sources for: " + query,
    intent.window && "Publication window: " + intent.window.label,
  ].filter(Boolean).join(". ")
  return searchSources(await parallelTool("web_search", { objective, search_queries: [keywords] }, signal), "parallel", limit)
}

export async function searchTavily(query: string, limit: number, signal: AbortSignal, intent: FreshnessIntent) {
  const key = freeTavilyKey() || process.env.TAVILY_API_KEY?.trim()
  if (!key) return []
  const response = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      query, search_depth: "basic", max_results: Math.min(limit, 10),
      include_answer: false, include_raw_content: false, ...searchTimeFilters(intent).tavily,
    }),
    redirect: "error", cache: "no-store",
  }, 3500, signal)
  if (!response.ok) throw new Error("Tavily search HTTP " + response.status)
  return searchSources(records(object(await response.json()).results), "tavily", limit)
}

export async function searchExa(query: string, limit: number, signal: AbortSignal, intent?: FreshnessIntent) {
  const key = exaKey()
  if (!key) return []
  const response = await fetchResearchResponse("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      query, type: "lite", numResults: Math.min(8, limit), contents: { highlights: true },
      ...(intent?.news && intent.window ? { startPublishedDate: intent.window.from, endPublishedDate: intent.window.to } : {}),
    }),
    signal, redirect: "error", cache: "no-store",
  }, 3500, 256_000)
  if (!response.ok) throw new Error("Exa HTTP " + response.status)
  return searchSources(records(object(await response.json()).results), "exa", limit)
}

function extractedPage(result: SearchResult, row: WebRecord | undefined, content: string, provider: string): FetchedSource | null {
  const text = clampText(stripHtml(content), Number(process.env.RESEARCH_MAX_TEXT || 18000))
  if (!row || text.length < 140) return null
  const now = new Date().toISOString()
  const acquired = Date.parse(string(row.acquired_at))
  return {
    ...result,
    title: cleanTitle(string(row.title) || result.title),
    text, provider, checkedAt: now,
    readAt: Number.isFinite(acquired) && acquired <= Date.now() ? new Date(acquired).toISOString() : now,
    publishedAt: string(row.publish_date) || result.publishedAt,
  }
}

export async function readParallelPage(result: SearchResult, target: string, signal: AbortSignal) {
  const rows = await parallelTool("web_fetch", { urls: [target], full_content: false }, signal)
  const row = rows.find(item => publicUrl(item.url) === publicUrl(target))
  return extractedPage(result, row, passages(row?.excerpts), "parallel-reader")
}

export async function readTavilyPage(result: SearchResult, target: string, signal: AbortSignal) {
  const key = freeTavilyKey()
  if (!key) return null
  const response = await fetchResearchResponse("https://api.tavily.com/extract", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ urls: [target], extract_depth: "basic", format: "text" }),
    signal, redirect: "error", cache: "no-store",
  }, 5000, 512_000)
  if (!response.ok) return null
  const row = records(object(await response.json()).results).find(item => publicUrl(item.url) === publicUrl(target))
  return extractedPage(result, row, string(row?.raw_content), "tavily-reader")
}
