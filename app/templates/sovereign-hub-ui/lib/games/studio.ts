import {
  GAME_AUTHOR_SYSTEM, extractLogic, gameAuthorPrompt, gameContinuePrompt, gameEditPrompt, gameRepairPrompt, joinContinuation, wholeLines,
} from "./author"
import { buildGameHtml } from "./page"
import { GAME_PLANNER_SYSTEM, fallbackGamePlan, gameLocale, gamePlannerPrompt, mergeGamePlan, parseJsonObject } from "./plan"
import { staticGameReport } from "./qa"
import { smokeProblems, type SmokeOutcome } from "./smoke-harness"
import type { GamePlan, GameQa, GameResult } from "./types"

/**
 * USER REQUEST → PLAN → WRITE → (CONTINUE a cut reply) → CHECK → RUN → FIX → PAGE.
 *
 * Bounded everywhere: at most four continuations of one reply and two repair
 * rounds; a repair that does not reduce the problems ends the loop; the best
 * version seen is the one delivered, with whatever is still wrong said plainly.
 */

export type GameModel = (input: { system: string; prompt: string; taskPrompt: string; maxTokens: number; temperature: number; signal?: AbortSignal }) => Promise<string | null>
export type GameSmoke = (plan: GamePlan, logic: string, signal?: AbortSignal) => Promise<SmokeOutcome>
export type GameStage = "plan" | "code" | "continue" | "check" | "run" | "repair" | "page"

export class GameStudioError extends Error {
  constructor(public code: "MODEL_UNAVAILABLE" | "NO_CODE", message: string) { super(message) }
}

const MAX_CONTINUATIONS = 4
const MAX_REPAIRS = 2
const TASK = "Write a complete JavaScript HTML5 canvas game file (game.js) — complete runnable code"

type Version = { logic: string; qa: GameQa; problems: string[] }

export async function buildGame(input: {
  prompt: string
  model: GameModel
  smoke?: GameSmoke
  signal?: AbortSignal
  /** An existing game to change, with the person's instruction. */
  base?: { plan: GamePlan; logic: string }
  onStage?: (stage: GameStage, detail?: { round?: number; of?: number; problems?: number }) => void
}): Promise<GameResult> {
  const stage = input.onStage || (() => {})
  const calls = { plan: false, author: 0, continuations: 0, repairs: 0 }
  const ask = async (system: string, prompt: string, maxTokens: number, temperature: number) => {
    input.signal?.throwIfAborted()
    try {
      return await input.model({ system, prompt, taskPrompt: TASK, maxTokens, temperature, signal: input.signal })
    } catch (error) {
      input.signal?.throwIfAborted()
      console.warn("[MALIK_GAME] model call failed", error instanceof Error ? error.message : String(error))
      return null
    }
  }

  // 1. The design.
  let plan: GamePlan
  if (input.base) {
    plan = input.base.plan
  } else {
    stage("plan")
    const fallback = fallbackGamePlan(input.prompt, gameLocale(input.prompt))
    const reply = await ask(GAME_PLANNER_SYSTEM, gamePlannerPrompt(input.prompt, fallback), 2200, 0.6)
    const raw = reply ? parseJsonObject(reply) : null
    calls.plan = Boolean(raw)
    plan = mergeGamePlan(raw, fallback)
  }

  // 2. The code, continued until its end marker arrives.
  const write = async (prompt: string, temperature: number) => {
    const reply = await ask(GAME_AUTHOR_SYSTEM, prompt, 16_000, temperature)
    calls.author += 1
    if (!reply) return null
    let { code, complete } = extractLogic(reply)
    for (let round = 1; !complete && round <= MAX_CONTINUATIONS && code.trim(); round += 1) {
      stage("continue", { round, of: MAX_CONTINUATIONS })
      const kept = wholeLines(code)
      const more = await ask(GAME_AUTHOR_SYSTEM, gameContinuePrompt(kept), 12_000, 0.2)
      calls.continuations += 1
      if (!more) break
      const joined = joinContinuation(kept, more)
      // A continuation that adds almost nothing will not finish the file either.
      const progress = joined.code.length - kept.length
      code = joined.code
      complete = joined.complete
      if (!complete && progress < 80) break
    }
    return code.trim() ? code : null
  }

  stage("code")
  const first = await write(input.base ? gameEditPrompt(input.prompt, plan, input.base.logic) : gameAuthorPrompt(input.prompt, plan), input.base ? 0.25 : 0.45)
  if (!first) {
    if (input.base) throw new GameStudioError("MODEL_UNAVAILABLE", "The model did not answer the change request")
    throw new GameStudioError("MODEL_UNAVAILABLE", "The model did not write the game")
  }

  const check = async (logic: string): Promise<Version> => {
    stage("check")
    const report = staticGameReport(logic)
    const qa: GameQa = { syntax: report.syntax, policy: report.policy, contract: report.contract, run: { status: "not_run", details: [] } }
    let problems = [...report.problems]
    if (!problems.length && input.smoke) {
      stage("run")
      const outcome = await input.smoke(plan, logic, input.signal)
      const found = smokeProblems(outcome)
      const active = outcome.active || outcome.idle
      qa.run = outcome.notRun
        ? { status: "not_run", details: [String(outcome.stage || "not run")] }
        : {
          status: found.length ? "fail" : "pass",
          details: found,
          frames: active?.frames,
          drawOpsPerFrame: active?.gameOpsPerFrame,
          reactsToInput: outcome.reacts,
          ended: active?.ended,
        }
      problems = found
    }
    return { logic, qa, problems }
  }

  // 3. Check, run, and repair with the real findings.
  let best = await check(first)
  let current = best
  for (let round = 1; round <= MAX_REPAIRS && current.problems.length; round += 1) {
    stage("repair", { round, of: MAX_REPAIRS, problems: current.problems.length })
    const fixed = await write(gameRepairPrompt(input.prompt, plan, current.logic, current.problems), 0.2)
    calls.repairs += 1
    if (!fixed) break
    const next = await check(fixed)
    const better = rank(next) < rank(best)
    if (better) best = next
    // A repair that does not reduce the problems will not converge: stop here.
    if (!better) break
    current = next
  }

  stage("page")
  const ok = best.qa.syntax.status === "pass" && best.qa.policy.status === "pass" && best.qa.contract.status === "pass" && best.qa.run.status !== "fail"
  return { plan, logic: best.logic, html: buildGameHtml(plan, best.logic), qa: best.qa, calls, ok }
}

/** Fewer and lighter problems rank lower: a file that does not parse is worst, a game that runs is best. */
function rank(version: Version) {
  const { qa } = version
  if (qa.syntax.status === "fail") return 1000 + qa.syntax.details.length
  if (qa.policy.status === "fail" || qa.contract.status === "fail") return 500 + qa.policy.details.length + qa.contract.details.length
  return qa.run.status === "fail" ? 100 + qa.run.details.length : 0
}
