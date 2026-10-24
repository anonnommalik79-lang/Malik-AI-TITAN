import { buildPassport, type PassportCheck, type ProofPassport } from "@/lib/proof/passport"
import type { GamePlan, GameQa } from "./types"

/**
 * A game's proof passport, from the checks Game Studio really ran: the
 * parser, the safety policy, the contract and the isolated runs. The run in a
 * real browser (graphics, sound, feel) is required and is not something the
 * server can do — so a server-checked game is PARTIAL until the chat preview
 * reports that the game ran in the person's browser.
 */

/** A short stable id from the content (FNV-1a), so a changed game gets a new id. */
export function gameProjectId(plan: GamePlan, logic: string) {
  let hash = 0x811c9dc5
  for (const char of `${plan.title}\n${logic}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0 }
  const slug = plan.title.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, "-").replace(/^-+|-+$/gu, "").slice(0, 24) || "game"
  return `game-${slug}-${hash.toString(16).padStart(8, "0")}`
}

export function gamePassport(input: { plan: GamePlan; logic: string; qa: GameQa; checkedAt: string; runMs?: number; version?: number; repairs?: number }): ProofPassport {
  const { qa } = input
  const en = input.plan.locale === "en"
  const staticCheck = (id: string, label: string, check: GameQa["syntax"], command: string): PassportCheck => ({
    id, kind: "static", label, required: true, command,
    status: check.status === "not_run" ? "not_run" : check.status,
    ranAt: input.checkedAt, details: check.details,
  })
  const run = qa.run
  const ran = run.status !== "not_run"
  const runChecks: PassportCheck[] = [
    {
      id: "run-idle-active", kind: "runtime", required: true,
      label: en ? "Isolated run: 600 frames without input and 600 with scripted input" : "Изолированный запуск: 600 кадров без ввода и 600 с управлением",
      command: "node --permission --disallow-code-generation-from-strings (vm sandbox, lib/games/smoke.ts)",
      status: ran ? (run.status === "pass" || !run.details.some((line) => /crash|froze|freez|throws/iu.test(line)) ? "pass" : "fail") : "not_run",
      ranAt: input.checkedAt, durationMs: input.runMs,
      details: ran ? [en ? `${run.frames ?? 0} frames, ~${run.drawOpsPerFrame ?? 0} shapes per frame` : `${run.frames ?? 0} кадров, ~${run.drawOpsPerFrame ?? 0} элементов за кадр`, ...run.details.filter((line) => /crash|froze|freez|throws/iu.test(line))] : run.details,
    },
    {
      id: "controls", kind: "runtime", required: true,
      label: en ? "Controls change the game" : "Управление меняет ход игры",
      command: "compare frame signatures: no input vs scripted input",
      status: ran ? (run.reactsToInput ? "pass" : "fail") : "not_run",
      ranAt: input.checkedAt, details: ran && !run.reactsToInput ? run.details.filter((line) => /controls/iu.test(line)) : [],
    },
    {
      id: "draws", kind: "runtime", required: false,
      label: en ? "Every frame draws the world (no blank frames, no NaN coordinates)" : "Каждый кадр рисует мир (без пустых кадров и NaN)",
      status: ran ? (run.details.some((line) => /NaN|almost nothing/iu.test(line)) ? "fail" : "pass") : "not_run",
      ranAt: input.checkedAt, details: run.details.filter((line) => /NaN|almost nothing/iu.test(line)),
    },
    {
      id: "browser", kind: "browser", required: true,
      label: en ? "Runs in a real browser (graphics, sound, input)" : "Запуск в настоящем браузере (графика, звук, ввод)",
      status: "not_run", details: [],
    },
  ]
  return buildPassport({
    projectId: gameProjectId(input.plan, input.logic),
    projectVersion: input.version || 1,
    kind: "game",
    title: input.plan.title,
    checks: [
      staticCheck("syntax", en ? "Syntax (JavaScript parser)" : "Синтаксис (парсер JavaScript)", qa.syntax, "typescript.transpileModule(game.js)"),
      staticCheck("policy", en ? "Safety policy: no network, storage, DOM, eval" : "Политика безопасности: без сети, хранилища, DOM, eval", qa.policy, "AST policy (lib/games/qa.ts)"),
      staticCheck("contract", en ? "Game contract: MalikGame.define with update and draw" : "Контракт игры: MalikGame.define с update и draw", qa.contract, "AST contract (lib/games/qa.ts)"),
      ...runChecks,
    ],
    knownIssues: [...qa.syntax.details, ...qa.policy.details, ...qa.contract.details, ...(run.status === "fail" ? run.details : [])],
    blindSpots: [en ? "How it looks, sounds and feels is judged by a person" : "Как игра выглядит, звучит и ощущается — оценивает человек"],
    artifacts: [{ name: "index.html" }, { name: "game.js", bytes: input.logic.length }],
    logs: input.repairs ? [en ? `Automatic repairs: ${input.repairs}` : `Автоматических исправлений: ${input.repairs}`] : [],
    now: new Date(input.checkedAt),
  })
}
