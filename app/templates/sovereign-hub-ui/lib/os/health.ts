import "server-only"

import { perfReport } from "./perf"
import { storeIsDurable } from "./store"

/**
 * Model health matrix: only what was configured or actually observed.
 * "observed-ok" needs a real success on this server; a lane with no traffic
 * yet is "configured", never "healthy"; a resting lane says why and for how
 * long. Keys are never part of the answer.
 */

export type LaneState = "observed-ok" | "failing" | "resting" | "configured"

type ProviderRow = {
  provider: string
  lanes: number
  resting: number
  ok: number
  fail: number
  firstTokenMsMedian: number | null
  state: LaneState
  models: string[]
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function configured(...names: string[]) {
  return names.some((name) => String(process.env[name] || "").trim().length > 0)
}

export async function healthMatrix(detailed: boolean) {
  const { maxLaneStatus } = await import("@/lib/server/malik-max-engine")
  const lanes = await maxLaneStatus().catch(() => [])
  const byProvider = new Map<string, typeof lanes>()
  for (const lane of lanes) byProvider.set(lane.provider, [...(byProvider.get(lane.provider) || []), lane])
  const providers: ProviderRow[] = [...byProvider.entries()].map(([provider, rows]) => {
    const ok = rows.reduce((total, row) => total + row.ok, 0)
    const fail = rows.reduce((total, row) => total + row.fail, 0)
    const resting = rows.filter((row) => row.restingMs > 0).length
    const state: LaneState = resting === rows.length ? "resting" : ok > 0 && ok >= fail ? "observed-ok" : fail > 0 && ok === 0 ? "failing" : "configured"
    return {
      provider,
      lanes: rows.length,
      resting,
      ok,
      fail,
      firstTokenMsMedian: median(rows.map((row) => row.firstTokenMs).filter((value) => value > 0)),
      state,
      models: [...new Set(rows.map((row) => row.model))].slice(0, 8),
    }
  }).sort((a, b) => b.ok - a.ok || a.provider.localeCompare(b.provider))

  const search = {
    serper: configured("SERPER_API_KEY"),
    tavily: configured("TAVILY_API_KEY"),
    brave: configured("BRAVE_SEARCH_API_KEY"),
    jina: process.env.JINA_SEARCH_DISABLED !== "true",
    searxng: configured("SEARXNG_URL"),
  }
  const tools = perfReport().filter((row) => row.metric.startsWith("tool.")).map((row) => ({
    tool: row.metric.slice(5),
    runs: row.count,
    successRate: row.successRate,
    p50: row.p50,
    p95: row.p95,
    budgetMs: row.budgetMs,
  }))
  const summary = {
    text: {
      lanes: lanes.length,
      available: lanes.filter((lane) => lane.restingMs <= 0).length,
      observedOk: providers.filter((row) => row.state === "observed-ok").length,
      providers: providers.length,
    },
    search: { configured: Object.values(search).filter(Boolean).length },
    image: { directDelivery: /^(?:1|true|yes|on)$/i.test(String(process.env.MALIK_IMAGE_EPHEMERAL_DIRECT || "")), primaryConfigured: configured("AGNES_API_KEY", "AGNES_API_KEY_1", "AGNES_API_KEY_2", "AGNES_API_KEY_3") },
    storage: { projectsDurable: await storeIsDurable() },
    tools,
  }
  if (!detailed) return { summary }
  const { getMediaProviderHealth } = await import("@/lib/media/health")
  const media = await getMediaProviderHealth().catch(() => null)
  return {
    summary,
    providers,
    lanes: lanes.map((lane) => ({ id: lane.id.replace(/#\d+$/, ""), provider: lane.provider, model: lane.model, key: lane.key, power: lane.power, restingMs: lane.restingMs, restReason: lane.restReason, ok: lane.ok, fail: lane.fail, firstTokenMs: lane.firstTokenMs, lastError: String(lane.lastError || "").slice(0, 160) })),
    search,
    media,
  }
}
