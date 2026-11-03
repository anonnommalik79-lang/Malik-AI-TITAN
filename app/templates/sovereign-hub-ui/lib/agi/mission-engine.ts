import { randomUUID } from "node:crypto"

export type MalikAgiRole = "analyst" | "architect" | "builder" | "verifier"
export type CheckState = "pass" | "fail" | "not_run"
export type AgentStage = {
  role: MalikAgiRole
  status: "done" | "failed" | "blocked"
  durationMs: number
  report: string
}
export type BuildEvidence = {
  kind: "selfbuild-cli"
  projectId: string
  title: string
  files: Array<{ path: string; content: string }>
  staticCheck: CheckState
  unitCheck: CheckState
  details: string[]
  rounds: number
  provenance?: { provider?: string; model?: string }
}
export type AgentModel = (role: Exclude<MalikAgiRole, "builder">, prompt: string) => Promise<string>
export type AgentBuilder = (input: { originalGoal: string; design: string; analysis: string }) => Promise<BuildEvidence>
export type MalikAgiResult = {
  runId: string
  status: "verified" | "needs_review" | "failed"
  mode: "four-agent-cli-beta"
  startedAt: string
  durationMs: number
  stages: AgentStage[]
  evidence: BuildEvidence | null
  criticalVerdict: "pass" | "fail" | "unknown"
  note: string
}

const SYSTEM: Record<Exclude<MalikAgiRole, "builder">, string> = {
  analyst: "Analyse the exact user request. Return requirements, testable acceptance criteria, constraints and risks. Do not assert external actions occurred.",
  architect: "Design the smallest correct runnable Node.js ESM CLI, with built-in node:test tests. Use the analyst findings. Define interfaces, files, edge cases and verification.",
  verifier: "Independently audit the actual runner receipts and requirements. End on its own line with VERDICT: PASS, VERDICT: FAIL or VERDICT: UNKNOWN. Missing test evidence means UNKNOWN. A model's opinion is never a substitute for a test receipt.",
}

function clip(text: unknown, max = 8_000) {
  return String(text || "").trim().slice(0, max)
}
function errorText(error: unknown) {
  return clip(error instanceof Error ? error.message : error, 500) || "Unknown failure"
}
function verdict(text: string): MalikAgiResult["criticalVerdict"] {
  const candidates = [...text.matchAll(/^VERDICT:\s*(PASS|FAIL|UNKNOWN)\s*$/gim)]
  const last = candidates.at(-1)?.[1]?.toUpperCase()
  return last === "PASS" ? "pass" : last === "FAIL" ? "fail" : "unknown"
}

export async function runMalikAgiCli(
  goal: string,
  deps: {
    model: AgentModel
    build: AgentBuilder
    now?: () => number
    onStageStarted?: (role: MalikAgiRole) => void
    onStage?: (stage: AgentStage) => void
  },
): Promise<MalikAgiResult> {
  const normalized = clip(goal, 4_000)
  if (normalized.length < 20) throw new Error("AGI_GOAL_TOO_SHORT")
  const now = deps.now || Date.now
  const startedMs = now()
  const startedAt = new Date(startedMs).toISOString()
  const stages: AgentStage[] = []
  let evidence: BuildEvidence | null = null
  const started = (role: MalikAgiRole) => { try { deps.onStageStarted?.(role) } catch { /* Telemetry must never break the mission. */ } }
  const completed = (stage: AgentStage) => {
    stages.push(stage)
    try { deps.onStage?.(stage) } catch { /* Telemetry must never break the mission. */ }
  }

  const read = async (role: "analyst" | "architect" | "verifier", context: string) => {
    started(role)
    const start = now()
    try {
      const report = clip(await deps.model(role, [SYSTEM[role], "", "USER GOAL:", normalized, "", context].join("\n")), 12_000)
      if (report.length < 40) throw new Error("AGI_AGENT_EMPTY_REPORT")
      completed({ role, status: "done", durationMs: Math.max(0, now() - start), report })
      return report
    } catch (error) {
      completed({ role, status: "failed", durationMs: Math.max(0, now() - start), report: errorText(error) })
      return null
    }
  }

  const analyst = await read("analyst", "Return a concrete, testable specification.")
  if (!analyst) return finish("failed", "unknown", "Analysis agent failed; no build was attempted.")

  const architect = await read("architect", `ANALYST FINDINGS:\n${analyst}\n\nReturn a runnable CLI architecture with explicit tests.`)
  if (!architect) return finish("failed", "unknown", "Architecture agent failed; no build was attempted.")

  started("builder")
  const buildStart = now()
  try {
    evidence = await deps.build({ originalGoal: normalized, design: architect, analysis: analyst })
    if (!evidence || !Array.isArray(evidence.files)) throw new Error("AGI_INVALID_EXECUTOR_RECEIPT")
    const ok = evidence.files.length > 0 && evidence.staticCheck === "pass" && evidence.unitCheck === "pass"
    completed({
      role: "builder", status: ok ? "done" : "blocked", durationMs: Math.max(0, now() - buildStart),
      report: `Project: ${clip(evidence.projectId, 80)}; files: ${evidence.files.length}; static: ${evidence.staticCheck}; node --test: ${evidence.unitCheck}. ${evidence.details.slice(0, 4).join("; ")}`,
    })
  } catch (error) {
    completed({ role: "builder", status: "failed", durationMs: Math.max(0, now() - buildStart), report: errorText(error) })
    return finish("failed", "unknown", "Executor failed; do not claim files or tests exist.")
  }

  // Critic reads only file names and actual executor receipts, not simulated commands.
  const verify = await read("verifier", [
    "ANALYSIS:", analyst,
    "ARCHITECTURE:", architect,
    "EXECUTOR RECEIPT (authoritative):",
    JSON.stringify({
      projectId: evidence.projectId,
      files: evidence.files.map(file => file.path),
      staticCheck: evidence.staticCheck,
      unitCheck: evidence.unitCheck,
      details: evidence.details.slice(0, 12),
      rounds: evidence.rounds,
    }),
    "If either check is not pass, verdict MUST be UNKNOWN or FAIL.",
  ].join("\n\n"))
  const checked = verify ? verdict(verify) : "unknown"
  const verified = evidence.files.length > 0 && evidence.staticCheck === "pass" && evidence.unitCheck === "pass" && checked === "pass"
  return finish(verified ? "verified" : "needs_review", checked,
    verified
      ? "Both executor checks passed and the independent reviewer accepted the result; broader correctness and production security are not guaranteed."
      : "At least one check or review is incomplete or failed. Do not present this build as production ready.")

  function finish(status: MalikAgiResult["status"], criticalVerdict: MalikAgiResult["criticalVerdict"], note: string): MalikAgiResult {
    return {
      runId: randomUUID(), status, mode: "four-agent-cli-beta",
      startedAt, durationMs: Math.max(0, now() - startedMs),
      stages, evidence, criticalVerdict, note,
    }
  }
}
