import type { IntelligenceResult } from "./types"

export const FreeModeName = "free-mode"

export function runFreeMode(prompt: string): IntelligenceResult {
  const clean = String(prompt || "").trim()
  return {
    ok: true,
    kind: "chat",
    title: "FreeMode",
    summary: clean ? `free-mode processed: ${clean.slice(0, 180)}` : "free-mode ready.",
    nextActions: ["route", "validate", "save-history"],
  }
}

export function describeFreeMode() {
  return {
    id: "free-mode",
    stable: true,
    renderSafe: true,
    secretsExposed: false,
    purpose: "MALIK AI final intelligence module for free-mode.",
  }
}

