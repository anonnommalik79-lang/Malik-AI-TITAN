export type GodProgress =
  | { mode: "stage"; stage: string; text: string }
  | { mode: "provider"; percent: number; stage?: string; text: string }

export function stageProgress(stage: string, text: string): GodProgress {
  return {
    mode: "stage",
    stage: String(stage || "working").slice(0, 80),
    text: String(text || "Malik AI работает…").slice(0, 240),
  }
}

export function providerProgress(percent: number, text: string, stage?: string): GodProgress {
  if (!Number.isFinite(percent)) return stageProgress(stage || "working", text)
  return {
    mode: "provider",
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    stage: stage?.slice(0, 80),
    text: String(text || "Malik AI работает…").slice(0, 240),
  }
}

/**
 * Never interpolate fake percentages between provider updates. The latest
 * provider percentage is shown as-is; otherwise the UI displays a named stage.
 */
export function normalizeProgress(input: { percent?: unknown; stage?: unknown; text?: unknown }): GodProgress {
  const text = String(input.text || "Malik AI работает…")
  const stage = String(input.stage || "working")
  return typeof input.percent === "number" && Number.isFinite(input.percent)
    ? providerProgress(input.percent, text, stage)
    : stageProgress(stage, text)
}
