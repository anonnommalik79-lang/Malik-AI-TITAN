import type { MalikWebSource } from "../ai/web-research-types"
import { classifyFreshness, publicSearchText, type FreshnessMode, type FreshnessIntent } from "../ai/freshness-intent"
import { assessSources, currentEvidenceAvailable } from "./evidence"

export type LiveSearchProvider = { name: string; timeoutMs?: number; run: (query: string, limit: number, signal: AbortSignal, intent: FreshnessIntent) => Promise<MalikWebSource[]> }
export type SearchAttempt = { provider: string; outcome: "success" | "empty" | "failed" | "circuit-open"; ms: number }
export type LiveSearchResult = { sources: MalikWebSource[]; attempts: SearchAttempt[]; queries: number; calls: number; cacheHits: number; fallbackSuccesses: number; tookMs: number; cost: "provider-dependent" | "no-api-calls" }
const LIMITS = { fast: { queries: 1, calls: 4, results: 4, ms: 10_000 }, deep: { queries: 2, calls: 6, results: 6, ms: 14_000 }, max: { queries: 3, calls: 8, results: 8, ms: 18_000 } } as const

export class EvidenceSearchCache {
  private entries = new Map<string, { expires: number; sources: MalikWebSource[] }>()
  private readonly maxEntries: number
  constructor(maxEntries = 128) { this.maxEntries = maxEntries }
  get(key: string, now: number): MalikWebSource[] | null {
    const item = this.entries.get(key)
    if (!item || now >= item.expires) { this.entries.delete(key); return null }
    this.entries.delete(key); this.entries.set(key, item)
    return structuredClone(item.sources)
  }
  set(key: string, sources: MalikWebSource[], now: number, ttl: number) {
    if (!sources.length) return // Empty/failing attempts must not hide a recovered provider.
    this.entries.set(key, { expires: now + ttl, sources: structuredClone(sources.slice(0, 8)) })
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!)
  }
  get size() { return this.entries.size }
}

export class ProviderCircuits {
  private state = new Map<string, { failures: number; until: number }>()
  open(provider: string, now: number) { return (this.state.get(provider)?.until || 0) > now }
  record(provider: string, ok: boolean, now: number) {
    if (ok) { this.state.delete(provider); return }
    const failures = (this.state.get(provider)?.failures || 0) + 1
    this.state.set(provider, { failures, until: failures >= 3 ? now + 60_000 : 0 })
    if (this.state.size > 32) this.state.delete(this.state.keys().next().value!)
  }
}
const cache = new EvidenceSearchCache()
const circuits = new ProviderCircuits()
let active = 0
const waiting: Array<() => void> = []
async function slot(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted()
  if (active < 2) active++
  else await new Promise<void>((resolve, reject) => {
    const take = () => { signal.removeEventListener("abort", abort); resolve() }
    const abort = () => { const index = waiting.indexOf(take); if (index >= 0) waiting.splice(index, 1); reject(signal.reason) }
    waiting.push(take); signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
  })
  return () => { const next = waiting.shift(); if (next) next(); else active-- }
}

export async function runLiveSearch(input: {
  prompt: string; queries: string[]; providers: LiveSearchProvider[]; mode?: FreshnessMode; signal?: AbortSignal
  rank?: (sources: MalikWebSource[]) => MalikWebSource[]
  now?: () => number; cache?: EvidenceSearchCache; circuits?: ProviderCircuits
  onQuery?: (query: string) => void
}): Promise<LiveSearchResult> {
  const clock = input.now || Date.now, started = clock()
  const intent = classifyFreshness(input.prompt, new Date(started))
  const limits = LIMITS[input.mode || "fast"]
  const deadline = AbortSignal.any([AbortSignal.timeout(limits.ms), ...(input.signal ? [input.signal] : [])])
  const result: LiveSearchResult = { sources: [], attempts: [], queries: 0, calls: 0, cacheHits: 0, fallbackSuccesses: 0, tookMs: 0, cost: "no-api-calls" }
  const memo = input.cache || cache, breaker = input.circuits || circuits
  if (!publicSearchText(input.prompt)) return result
  const queries = [...new Set(input.queries.map(publicSearchText).filter(Boolean))].slice(0, limits.queries)
  const take = (sources: MalikWebSource[]) => assessSources(input.prompt, input.rank ? input.rank(sources) : sources, intent)
  for (const query of queries) {
    if (deadline.aborted || result.calls >= limits.calls) break
    result.queries++; input.onQuery?.(query)
    // Bucket/window prevents yesterday's cache from crossing local midnight.
    const key = JSON.stringify([query, input.mode || "fast", intent.category, intent.localDate, intent.window?.label, input.providers.map((p) => p.name)])
    const hit = memo.get(key, clock())
    if (hit && (!intent.needsSearch || currentEvidenceAvailable(take(hit), intent))) { result.cacheHits++; result.sources.push(...hit); continue }
    let attempted = 0, successes = 0
    const confirmed: MalikWebSource[] = []
    const desiredProviders = input.mode === "max" ? 3 : input.mode === "deep" ? 2 : 1
    for (const provider of input.providers) {
      if (deadline.aborted || result.calls >= limits.calls) break
      if (breaker.open(provider.name, clock())) { result.attempts.push({ provider: provider.name, outcome: "circuit-open", ms: 0 }); continue }
      const before = clock()
      result.calls++; attempted++
      let release: (() => void) | undefined
      try {
        release = await slot(deadline)
        const attemptSignal = AbortSignal.any([deadline, AbortSignal.timeout(Math.max(1, Math.min(6000, provider.timeoutMs || 3500)))])
        // The adapter must cancel fetches; this race also bounds a faulty adapter.
        let abort: () => void = () => {}
        const cancelled = new Promise<never>((_, reject) => { abort = () => reject(attemptSignal.reason); attemptSignal.addEventListener("abort", abort, { once: true }); if (attemptSignal.aborted) abort() })
        let raw: MalikWebSource[]
        try { raw = await Promise.race([provider.run(query, limits.results, attemptSignal, intent), cancelled]) }
        finally { attemptSignal.removeEventListener("abort", abort) }
        deadline.throwIfAborted()
        const found = take(raw)
        breaker.record(provider.name, raw.length > 0, clock())
        result.attempts.push({ provider: provider.name, outcome: found.length ? "success" : "empty", ms: clock() - before })
        if (found.length && (intent.category === "STATIC" || !intent.needsSearch || currentEvidenceAvailable(found, intent))) {
          if (!successes && attempted > 1) result.fallbackSuccesses++
          confirmed.push(...found); successes++
          if (successes >= desiredProviders) break
          continue
        }
        // Old/undated news may be retained as background, but cannot stop fallback.
        result.sources.push(...found)
      } catch {
        breaker.record(provider.name, false, clock())
        result.attempts.push({ provider: provider.name, outcome: "failed", ms: clock() - before })
      } finally { release?.() }
    }
    if (confirmed.length) memo.set(key, take(confirmed), clock(), intent.ttlMs)
    result.sources.push(...confirmed)
  }
  if (input.signal?.aborted) input.signal.throwIfAborted()
  result.sources = take(result.sources).slice(0, limits.results)
  result.tookMs = clock() - started
  result.cost = result.calls ? "provider-dependent" : "no-api-calls"
  return result
}
