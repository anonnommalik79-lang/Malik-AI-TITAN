import { gameChatMessage, gameStudioTurn } from "./chat"
import { buildGame, GameStudioError, type GameModel, type GameStage } from "./studio"
import type { GameLocale, GameResult } from "./types"
import { gameLocale } from "./plan"

/**
 * One chat turn handled by Malik Game Studio: the person's chosen model (the
 * oil ensemble and MalikCoder hand it to the default model, as the site forge
 * does) designs and writes the game, the server checks and runs it in an
 * isolated process, and progress is reported as the work happens.
 */

const MODEL_EXCEPTIONS = new Set(["malik-oil-1tb", "malik-coder-32b"])

export type GameTurnResult = { content: string; result: GameResult | null; mode: "new" | "edit"; failed?: string }

const PROGRESS: Record<GameStage, Record<GameLocale, string>> = {
  plan: { ru: "Проектирую игру: жанр, механики, уровни и стиль", kk: "Ойынды жобалаймын: жанр, механика, деңгейлер", en: "Designing the game: genre, mechanics, levels and look" },
  code: { ru: "Пишу код игры", kk: "Ойын кодын жазамын", en: "Writing the game code" },
  continue: { ru: "Ответ модели оборвался — дописываю код с места обрыва", kk: "Модель жауабы үзілді — кодты үзілген жерінен жалғастырамын", en: "The model's reply was cut off — continuing the code from that point" },
  check: { ru: "Проверяю синтаксис и безопасность кода", kk: "Синтаксис пен қауіпсіздікті тексеремін", en: "Checking syntax and safety" },
  run: { ru: "Запускаю игру в изолированной песочнице: 600 кадров с управлением", kk: "Ойынды оқшауланған құмсалғышта іске қосамын", en: "Running the game in an isolated sandbox: 600 frames with input" },
  repair: { ru: "Исправляю найденные при прогоне ошибки", kk: "Табылған қателерді түзетемін", en: "Fixing what the run found" },
  page: { ru: "Собираю страницу игры", kk: "Ойын бетін жинаймын", en: "Building the game page" },
}

const FAILED: Record<GameLocale, string> = {
  ru: "Не удалось создать игру: модели сейчас не ответили. Ничего не выдаю вместо игры — повторите запрос через минуту.",
  kk: "Ойын жасалмады: модельдер қазір жауап бермеді. Ойынның орнына ештеңе бермеймін — бір минуттан кейін қайталаңыз.",
  en: "The game could not be made: the models did not answer just now. Nothing is passed off as a game — please try again in a minute.",
}

export async function runGameStudioTurn(input: {
  prompt: string
  body: any
  modelId: string
  defaultModelId: string
  allowCatalog?: boolean
  signal?: AbortSignal
  onProgress?: (progress: { phase: string; text: string }) => void
}): Promise<GameTurnResult | null> {
  const turn = gameStudioTurn(input.prompt, { messages: input.body?.messages || input.body?.history, attachments: input.body?.attachments })
  if (!turn) return null
  const locale = turn.kind === "edit" ? turn.plan.locale : gameLocale(input.prompt)
  const modelId = MODEL_EXCEPTIONS.has(input.modelId) ? input.defaultModelId : input.modelId
  const model: GameModel = async ({ system, prompt, taskPrompt, maxTokens, temperature, signal }) => {
    const { runStrictMalikModel } = await import("@/lib/server/malik-model-router")
    const answer = await runStrictMalikModel({ modelId: modelId as never, prompt, taskPrompt, systemPrompt: system, maxTokens, temperature, reasoningEffort: "low", allowCatalog: input.allowCatalog, signal })
    return answer?.content || null
  }
  const { smokeRunGame } = await import("./smoke")
  try {
    const result = await buildGame({
      prompt: input.prompt,
      model,
      smoke: (plan, logic, signal) => smokeRunGame(plan, logic, { signal }),
      signal: input.signal,
      ...(turn.kind === "edit" ? { base: { plan: turn.plan, logic: turn.logic } } : {}),
      onStage: (stage, detail) => {
        const text = PROGRESS[stage][locale]
        input.onProgress?.({ phase: "game-studio", text: detail?.round ? `${text} (${detail.round}/${detail.of})` : text })
      },
    })
    return { content: gameChatMessage(result, turn.kind), result, mode: turn.kind }
  } catch (error) {
    if (input.signal?.aborted) throw error
    if (error instanceof GameStudioError) return { content: FAILED[locale], result: null, mode: turn.kind, failed: error.code }
    throw error
  }
}
