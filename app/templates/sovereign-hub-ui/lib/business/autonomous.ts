/**
 * Autonomous Company: the eight agents, and the templates that start them.
 *
 * The agents are not decoration. Each one is a real business mode that already
 * exists in lib/business/modes.ts and already runs through POST
 * /api/business/run - the endpoint the section has always used. The pipeline is
 * those modes in the order a company is actually built, each one handed the
 * brief plus what the agents before it produced.
 *
 * That ordering is the whole idea: the market research is written before the
 * product is scoped, the product is scoped before the brand is written, and the
 * sales scripts are written knowing what the brand said. Running the same eight
 * modes in isolation would produce eight documents about eight different
 * companies.
 */

import type { BusinessModeId } from "./types"

export type AgentId = "ceo" | "research" | "coder" | "design" | "marketing" | "sales" | "support" | "analyst"

export type AutonomousAgent = {
  id: AgentId
  /** Shown on the chip, in the reference's own wording. */
  name: string
  role: string
  /** The mode this agent actually runs. Every one of these exists. */
  mode: BusinessModeId
  /** What this agent is told to produce, appended to the brief. */
  brief: string
}

export const AUTONOMOUS_AGENTS: AutonomousAgent[] = [
  {
    id: "ceo",
    name: "CEO",
    role: "Стратегия",
    mode: "ceo-decision",
    brief: "Определи стратегию запуска: во что именно вкладываться первым, что отложить, где главный риск и на чём бизнес заработает.",
  },
  {
    id: "research",
    name: "Research",
    role: "Рынок",
    mode: "business-war-map",
    brief: "Разбери рынок: спрос, конкуренты, свободные ниши и каналы, через которые придут первые клиенты.",
  },
  {
    id: "coder",
    name: "Coder",
    role: "Продукт",
    mode: "mvp-cut",
    brief: "Собери продукт и сайт: что входит в первую версию, из чего она состоит и что можно выкинуть без потери смысла.",
  },
  {
    id: "design",
    name: "Design",
    role: "Бренд",
    mode: "brand-voice",
    brief: "Собери бренд: имя, характер, как он разговаривает, как выглядит и чем отличается от соседей по полке.",
  },
  {
    id: "marketing",
    name: "Marketing",
    role: "Контент",
    mode: "tiktok-reels-engine",
    brief: "Сделай контент и продвижение: о чём говорить, в каком формате и что публиковать в первый месяц.",
  },
  {
    id: "sales",
    name: "Sales",
    role: "Лиды",
    mode: "ai-sales-manager",
    brief: "Построй привлечение клиентов: откуда идут заявки, что им отвечают и как доводят до оплаты.",
  },
  {
    id: "support",
    name: "Support",
    role: "Клиенты",
    mode: "customer-pain",
    brief: "Разбери работу с клиентами: чего они боятся, о чём спрашивают и что удерживает их после первой покупки.",
  },
  {
    id: "analyst",
    name: "Analyst",
    role: "Рост",
    mode: "revenue-engine",
    brief: "Собери экономику и рост: на чём деньги, какие цифры смотреть еженедельно и что двигать, чтобы выручка росла.",
  },
]

export type TemplateCategory =
  | "Все"
  | "Онлайн-бизнес"
  | "Услуги"
  | "E-commerce"
  | "Технологии"
  | "Офлайн"
  | "Инвестиции"
  | "Мои"

export const TEMPLATE_CATEGORIES: Array<{ id: TemplateCategory; label: string }> = [
  { id: "Все", label: "Все шаблоны" },
  { id: "Онлайн-бизнес", label: "Онлайн-бизнес" },
  { id: "Услуги", label: "Услуги" },
  { id: "E-commerce", label: "E-commerce" },
  { id: "Технологии", label: "Технологии" },
  { id: "Офлайн", label: "Офлайн" },
  { id: "Инвестиции", label: "Инвестиции" },
  { id: "Мои", label: "Мои шаблоны" },
]

export type BusinessTemplate = {
  id: string
  title: string
  description: string
  category: Exclude<TemplateCategory, "Все" | "Мои">
  image: string
  /** Fills the composer. */
  prompt: string
  /** Fills the controls beside it, where the template implies an answer. */
  market?: string
  country?: string
  budget?: string
  requirements?: string
}

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: "coffee",
    title: "Кофейня",
    description: "Полный запуск: бренд, меню, маркетинг, персонал.",
    category: "Офлайн",
    image: "/business/templates/coffee.webp",
    prompt: "Создай автономную кофейню в Казахстане: бренд, меню, сайт, маркетинг, персонал, CRM, продажи.",
    market: "Общепит",
    country: "Казахстан",
    budget: "до 10 млн ₸",
    requirements: "Одна точка, команда до 5 человек",
  },
  {
    id: "apparel",
    title: "Бренд одежды",
    description: "Дизайн, производство, онлайн-продажи.",
    category: "E-commerce",
    image: "/business/templates/apparel.webp",
    prompt: "Создай бренд одежды: позиционирование, дизайн, производство, интернет-магазин, контент, маркетинг и продажи.",
    market: "Fashion / D2C",
    country: "Казахстан",
    budget: "до 5 млн ₸",
    requirements: "Небольшие партии, продажи через Instagram и сайт",
  },
  {
    id: "agency",
    title: "Агентство",
    description: "Маркетинг, ИИ, дизайн и разработка.",
    category: "Услуги",
    image: "/business/templates/agency.webp",
    prompt: "Создай AI/SMM агентство: услуги, сайт, CRM, поиск клиентов, продажи и автоматизация.",
    market: "B2B услуги",
    country: "Казахстан",
    budget: "до 2 млн ₸",
    requirements: "Работа удалённо, команда 2–4 человека",
  },
  {
    id: "shop",
    title: "Онлайн магазин",
    description: "Товары, сайт, логистика, реклама.",
    category: "E-commerce",
    image: "/business/templates/shop.webp",
    prompt: "Создай онлайн-магазин: товары, сайт, платежи, логистика, реклама, CRM и продажи.",
    market: "E-commerce",
    country: "Казахстан",
    budget: "до 7 млн ₸",
    requirements: "Доставка по Казахстану, оплата картой и Kaspi",
  },
  {
    id: "realestate",
    title: "Недвижимость",
    description: "Покупка, аренда, управление, инвестиции.",
    category: "Инвестиции",
    image: "/business/templates/realestate.webp",
    prompt: "Создай бизнес в недвижимости: объекты, сайт, заявки, CRM, маркетинг и сделки.",
    market: "Недвижимость",
    country: "Казахстан",
    budget: "от 30 млн ₸",
    requirements: "Работа с застройщиками и вторичным рынком",
  },
  {
    id: "restaurant",
    title: "Ресторан",
    description: "Концепция, меню, команда, продвижение.",
    category: "Офлайн",
    image: "/business/templates/restaurant.webp",
    prompt: "Создай ресторан: концепция, меню, бренд, персонал, бронирование, маркетинг и продажи.",
    market: "Общепит",
    country: "Казахстан",
    budget: "до 40 млн ₸",
    requirements: "Полный цикл: кухня, зал, доставка",
  },
  {
    id: "fitness",
    title: "Фитнес клуб",
    description: "Оборудование, абонементы, маркетинг.",
    category: "Офлайн",
    image: "/business/templates/fitness.webp",
    prompt: "Создай фитнес-клуб: помещение, оборудование, абонементы, тренеры, приложение, маркетинг и удержание клиентов.",
    market: "Фитнес и здоровье",
    country: "Казахстан",
    budget: "до 60 млн ₸",
    requirements: "Абонементы и групповые программы",
  },
  {
    id: "saas",
    title: "SaaS продукт",
    description: "Разработка, монетизация, масштабирование.",
    category: "Технологии",
    image: "/business/templates/saas.webp",
    prompt: "Создай SaaS-продукт: проблема, MVP, тарифы, онбординг, интеграции, маркетинг и продажи.",
    market: "B2B SaaS",
    country: "Глобально",
    budget: "до 3 млн ₸",
    requirements: "Подписка, самостоятельный онбординг",
  },
  {
    id: "logistics",
    title: "Логистика",
    description: "Доставка, склады, партнёры, клиенты.",
    category: "Услуги",
    image: "/business/templates/logistics.webp",
    prompt: "Создай логистическую компанию: маршруты, склад, партнёры, тарифы, CRM, клиенты и продажи.",
    market: "Логистика",
    country: "Казахстан",
    budget: "до 25 млн ₸",
    requirements: "Доставка между городами, работа с маркетплейсами",
  },
  {
    id: "travel",
    title: "Туризм",
    description: "Туры, бронирование, маркетинг, клиенты.",
    category: "Онлайн-бизнес",
    image: "/business/templates/travel.webp",
    prompt: "Создай туристический бизнес: направления, туры, бронирование, сайт, маркетинг и продажи.",
    market: "Туризм",
    country: "Казахстан",
    budget: "до 8 млн ₸",
    requirements: "Выездной туризм и внутренние направления",
  },
  {
    id: "courses",
    title: "Онлайн курсы",
    description: "Контент, платформа, продвижение, продажи.",
    category: "Онлайн-бизнес",
    image: "/business/templates/courses.webp",
    prompt: "Создай онлайн-школу: программа, платформа, преподаватели, воронка, маркетинг и продажи.",
    market: "EdTech",
    country: "Казахстан",
    budget: "до 4 млн ₸",
    requirements: "Запись курсов и потоковые группы",
  },
]

/** The full brief handed to one agent: the idea, its context, and what came before. */
export function agentInput(agent: AutonomousAgent, brief: string, previous: Array<{ agent: AutonomousAgent; content: string }>) {
  const earlier = previous
    .slice(-3)
    .map((step) => `### ${step.agent.name} (${step.agent.role})\n${step.content.slice(0, 1400)}`)
    .join("\n\n")

  return [
    `ИДЕЯ БИЗНЕСА:\n${brief}`,
    earlier ? `УЖЕ СДЕЛАНО ДРУГИМИ АГЕНТАМИ:\n${earlier}` : "",
    `ТВОЯ ЗАДАЧА (${agent.name} · ${agent.role}):\n${agent.brief}`,
    "Не повторяй то, что уже написали другие агенты. Продолжай с того места, где они остановились.",
  ].filter(Boolean).join("\n\n")
}
