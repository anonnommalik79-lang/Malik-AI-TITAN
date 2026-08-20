"use client"

import { clientFetchWithTimeout } from "@/lib/api-client"

/**
 * The three meters in the right rail.
 *
 * The design calls for CPU / RAM / Сеть, and the app has no host-metrics
 * endpoint, so those readings are placeholders. They live here — in one named
 * constant with one flag — rather than being scattered through the markup, so
 * the day a metrics endpoint exists this becomes a one-line change instead of a
 * hunt through components.
 *
 * `readLiveSystemMetrics` is already written against endpoints that do exist:
 * /api/ai/usage returns the signed-in user's real consumption against their
 * plan limits, and /api/health returns real uptime. Flip USE_LIVE_SYSTEM_METRICS
 * to true and the same three bars render measured numbers instead.
 */
export const USE_LIVE_SYSTEM_METRICS = false

export type SystemMetric = {
  id: string
  label: string
  /** 0–100, drives the bar width. */
  value: number
  /** What the bar prints on the right. */
  display: string
}

export const PLACEHOLDER_SYSTEM_METRICS: SystemMetric[] = [
  { id: "cpu", label: "CPU", value: 42, display: "42%" },
  { id: "ram", label: "RAM", value: 68, display: "68%" },
  { id: "net", label: "Сеть", value: 99, display: "99%" },
]

type UsageResponse = {
  ok?: boolean
  usage?: { chat?: number; image?: number; video?: number; project?: number }
  limits?: { chat?: number; image?: number; video?: number; project?: number }
}

function percentUsed(used?: number, limit?: number): number {
  if (!limit || limit <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((used || 0) / limit) * 100)))
}

/** Real consumption against the account's plan. Returns null if unavailable. */
export async function readLiveSystemMetrics(): Promise<SystemMetric[] | null> {
  try {
    const response = await clientFetchWithTimeout("/api/ai/usage", { method: "GET" }, 6000)
    if (!response.ok) return null

    const data = (await response.json()) as UsageResponse
    if (!data?.ok || !data.limits) return null

    const rows: Array<[string, string, number | undefined, number | undefined]> = [
      ["chat", "Диалоги", data.usage?.chat, data.limits.chat],
      ["image", "Изображения", data.usage?.image, data.limits.image],
      ["video", "Видео", data.usage?.video, data.limits.video],
    ]

    return rows.map(([id, label, used, limit]) => ({
      id,
      label,
      value: percentUsed(used, limit),
      display: `${used || 0}/${limit ?? "∞"}`,
    }))
  } catch {
    return null
  }
}

export type RuntimeHealth = {
  online: boolean
  uptimeSeconds: number
}

export async function readRuntimeHealth(): Promise<RuntimeHealth | null> {
  try {
    const response = await clientFetchWithTimeout("/api/health", { method: "GET" }, 6000)
    if (!response.ok) return { online: false, uptimeSeconds: 0 }
    const data = await response.json()
    return { online: Boolean(data?.ok), uptimeSeconds: Number(data?.uptimeSeconds) || 0 }
  } catch {
    return null
  }
}
