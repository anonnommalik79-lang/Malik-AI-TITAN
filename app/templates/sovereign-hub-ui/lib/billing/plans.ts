import { FREE_MALIK_MODELS, MALIK_MODELS } from "../ai/malik-models"

// Keep "pro" as the stored entitlement ID so existing subscriptions keep working.
export const PUBLIC_PLANS = [
  {
    id: "free",
    title: "Бесплатный",
    price: "0",
    description: "Для знакомства и повседневных задач.",
    features: [
      ...FREE_MALIK_MODELS.map((model) => model.label),
      "Веб-поиск по запросу с источниками",
      "История чатов и контекст диалога",
      "Проекты и готовые шаблоны",
      "Голосовой режим в пределах дневного лимита",
    ],
  },
  {
    id: "pro",
    title: "MalikAI Plus",
    price: "По запросу",
    description: "Больше моделей для сложных идей и проектов.",
    features: [
      `Все ${MALIK_MODELS.length} моделей Malik AI`,
      "Всё, что включено в бесплатный тариф",
      "MalikCoder32B для продвинутого кода",
      "Vision-модели для анализа изображений",
      "MalikLLM120B и MalikAgent120B",
      "Максимальная глубина ответа",
      "Расширенные лимиты генерации медиа",
    ],
  },
] as const

export function publicPlanTitle(plan?: string | null) {
  return plan === "pro" || plan === "ultra" || plan === "owner" ? "MalikAI Plus" : "Бесплатный"
}
