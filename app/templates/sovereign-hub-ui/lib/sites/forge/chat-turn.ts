import { forgeSite, type ForgeModel, type ForgeResult } from "./index"
import { forgeChatMessage, siteForgeTurn } from "./chat"
import type { PhotoFinder } from "./photos"

/**
 * One chat turn handled by the forge: the selected model writes the plan
 * (the oil ensemble and MalikCoder hand it to the default model), photographs
 * are searched with the same licence-checked finder the presentations use,
 * and progress is reported as the work happens.
 */

const MODEL_FOR_PLAN_EXCEPTIONS = new Set(["malik-oil-1tb", "malik-coder-32b"])

export type ForgeTurnResult = { content: string; result: ForgeResult; mode: "new" | "edit" }

export async function runSiteForgeTurn(input: {
  prompt: string
  body: any
  modelId: string
  defaultModelId: string
  allowCatalog?: boolean
  signal?: AbortSignal
  onProgress?: (progress: { phase: string; text: string }) => void
}): Promise<ForgeTurnResult | null> {
  const turn = siteForgeTurn(input.prompt, { messages: input.body?.messages, attachments: input.body?.attachments })
  if (!turn) return null
  const locale = /[а-яё]/iu.test(input.prompt) ? "ru" : "en"
  const say = (ru: string, en: string) => input.onProgress?.({ phase: "site-forge", text: locale === "ru" ? ru : en })

  const modelId = MODEL_FOR_PLAN_EXCEPTIONS.has(input.modelId) ? input.defaultModelId : input.modelId
  const model: ForgeModel = async ({ system, prompt, signal }) => {
    const { runStrictMalikModel } = await import("@/lib/server/malik-model-router")
    const answer = await runStrictMalikModel({ modelId: modelId as never, prompt, systemPrompt: system, maxTokens: 7000, temperature: 0.45, reasoningEffort: "low", allowCatalog: input.allowCatalog, signal })
    return answer?.content || null
  }
  const finder: PhotoFinder = async (query, exclude) => {
    const { findPhoto } = await import("@/lib/server/presentation-photos")
    const photo = await findPhoto({ query, kind: "mood", exclude })
    return photo ? { url: photo.url, credit: photo.credit, link: photo.link } : null
  }

  say(turn.kind === "edit" ? "Вношу правку в план сайта" : "Пишу тексты, меню и цены для сайта", turn.kind === "edit" ? "Applying the change to the site plan" : "Writing the copy, menu and prices")
  const result = await forgeSite({
    prompt: input.prompt,
    model,
    finder,
    signal: input.signal,
    ...(turn.kind === "edit" ? { basePlan: turn.plan, editInstruction: input.prompt } : {}),
    onStage: (stage) => {
      if (stage === "photos") say("Подбираю фотографии по теме", "Choosing photos for the topic")
      if (stage === "render") say("Собираю страницы, корзину и бронирование", "Building the pages, basket and booking")
      if (stage === "review") say("Проверяю ссылки, формы и мобильную версию", "Checking links, forms and the phone layout")
    },
  })
  return { content: forgeChatMessage(result, turn.kind), result, mode: turn.kind }
}
