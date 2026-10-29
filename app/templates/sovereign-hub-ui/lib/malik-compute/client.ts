import type { ComputePageData } from "./types"

const operations = ["chat", "agent", "research", "image", "voice", "video", "plugin"] as const
const units = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0

/** Reject broken balances rather than rendering invented zeroes/NaN as quota. */
export function parseComputePage(value: unknown): ComputePageData {
  const data = value as ComputePageData | null
  const balance = data?.balance
  if (!data || data.mode !== "live" || typeof data.guest !== "boolean" || !balance
    || ![balance.dailyLimit, balance.used, balance.reserved, balance.remaining].every(units)
    || balance.used + balance.reserved + balance.remaining !== balance.dailyLimit
    || !balance.usage || !operations.every((operation) => units(balance.usage[operation]))
    || operations.reduce((sum, operation) => sum + balance.usage[operation], 0) !== balance.used
    || !Number.isFinite(Date.parse(balance.resetsAt))) {
    throw new Error("Compute вернул некорректный баланс. Повторите обновление.")
  }
  return data
}

export async function fetchComputePage(signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<ComputePageData> {
  const response = await fetchImpl("/api/compute", { cache: "no-store", credentials: "same-origin", signal })
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? "Войдите в аккаунт или выберите гостевой вход, чтобы увидеть Compute."
      : "Не удалось обновить Compute. Попробуйте ещё раз.")
  }
  const data = await response.json()
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
  return parseComputePage(data)
}
