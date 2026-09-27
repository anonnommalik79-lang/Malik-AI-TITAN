import "server-only"

const DEFAULT_RENDER_RESPONSE_BUDGET_BYTES = 900_000

export function renderBandwidthGuardEnabled() {
  const raw = String(process.env.MALIK_RENDER_BANDWIDTH_GUARD || "true").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

export function renderResponseBudgetBytes() {
  const raw = Number(process.env.MALIK_RENDER_MAX_RESPONSE_BYTES || DEFAULT_RENDER_RESPONSE_BUDGET_BYTES)
  if (!Number.isFinite(raw)) return DEFAULT_RENDER_RESPONSE_BUDGET_BYTES
  return Math.max(128_000, Math.min(950_000, Math.floor(raw)))
}

export function renderResponseFitsBudget(bytes: number) {
  return !renderBandwidthGuardEnabled() || Number(bytes || 0) <= renderResponseBudgetBytes()
}

export function renderBandwidthBlocked(kind: string, bytes?: number) {
  return Response.json({
    ok: false,
    code: "RENDER_BANDWIDTH_GUARD",
    error: "Heavy binary delivery through Render is disabled.",
    kind,
    bytes: Number.isFinite(bytes) ? bytes : undefined,
    maxBytes: renderResponseBudgetBytes(),
  }, {
    status: 413,
    headers: { "cache-control": "private, no-store" },
  })
}
