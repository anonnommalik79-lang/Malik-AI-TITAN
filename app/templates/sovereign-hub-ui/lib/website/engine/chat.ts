import "server-only"
import { isFeatureDisabled } from "@/lib/server/request-safety"
import type { RequestEntitlement } from "@/lib/server/request-entitlement"
import { lastWebsiteJob, websiteIntent } from "./intent"
import { websiteStore } from "./store"

export function websiteEngineAvailable(owner?: RequestEntitlement) {
  return !isFeatureDisabled("website_engine") && Boolean(owner?.authenticated) && websiteStore.storage.configured()
}

/** Chat and Work use the same durable project, never a second untracked
 * filesystem. The Sites gallery/generation route are deliberately unchanged. */
export async function websiteChatTurn(input: { prompt: string; messages?: unknown; owner?: RequestEntitlement; modelId: string; requestId?: string }) {
  if (!websiteEngineAvailable(input.owner) || !input.owner) return null
  const previous = lastWebsiteJob(input.messages)
  const intent = websiteIntent(input.prompt, Boolean(previous))
  if (!intent) return null
  if ((intent === "edit" || intent === "preview") && !previous) return "Чтобы изменить существующий сайт, прикрепите его исходные файлы или откройте сохранённый проект. Я не буду подменять его новым шаблоном."
  try {
    const job = previous && intent !== "create"
      ? intent === "preview" ? await websiteStore.read(input.owner.userId, previous) : await websiteStore.control(input.owner.userId, previous, "edit", input.prompt)
      : await websiteStore.create({ actor: input.owner.userId, plan: input.owner.plan, modelId: input.modelId, prompt: input.prompt, requestId: input.requestId })
    if (!job) return "Сохранённый проект не найден в вашем аккаунте. Прикрепите исходники; чужой проект не открывался."
    return `Проект сохранён. Исходники будут создаваться и проверяться по этапам прямо здесь; сборка не считается пройденной без подтверждения.\n\n\`\`\`malik-project\n${JSON.stringify({ id: job.id })}\n\`\`\``
  } catch {
    return "Не удалось подтвердить сохранение или изменение проекта. Существующие файлы не удалены; запуск и успешная сборка не заявляются. Повторите запрос после восстановления хранилища или завершения текущей операции."
  }
}
