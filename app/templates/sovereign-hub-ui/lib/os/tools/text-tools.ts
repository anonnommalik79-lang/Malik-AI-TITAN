import { OsToolError } from "../failures"
import { normalizeLaunchPack, pitchesMarkdown, roadmapMarkdown } from "@/lib/business/launch-pack"
import { requestedDeckLanguage } from "@/lib/presentations/deck"
import type { ProjectSource } from "../types"
import type { ToolDefinition, WebSource } from "./contract"
import {
  LANGUAGE_NAME,
  NO_INVENTION,
  askJson,
  askText,
  brandOf,
  briefOf,
  clip,
  languageOf,
  normalizeBrand,
  normalizeBrief,
  planOf,
  projectContext,
  researchOf,
  type Brief,
} from "./shared"

/* ------------------------------------------------------ goal.understand */

function rulesBrief(goal: string): Brief {
  // Used only when no model could read the goal: every field is taken from
  // the goal itself, and the artifact says so.
  const text = clip(goal, 600)
  const kz = /казах|kazakh|қазақ|алмат|астан/iu.test(goal)
  return {
    title: clip(goal.replace(/^(?:создай|сделай|подготовь|придумай)\s+/iu, ""), 80),
    language: languageOf(goal),
    country: kz ? "Казахстан" : "",
    industry: /технолог|tech|ai|ии|it/iu.test(goal) ? "технологии" : "не указана",
    idea: text,
    audience: "",
    problem: "",
    solution: "",
    businessModel: "",
    deliverables: [],
    queries: [kz ? `${text.slice(0, 80)} рынок Казахстан` : `${text.slice(0, 80)} market`],
    constraints: [],
  }
}

export const understandTool: ToolDefinition = {
  name: "goal.understand",
  label: "Понимаю цель",
  sideEffect: "none",
  timeoutMs: 90_000,
  async run(context) {
    context.activity("Разбираю задачу", 0.2)
    const goal = context.flow.goal
    const language = languageOf(goal)
    let brief: Brief
    let provider = "rules"
    let fallback = false
    try {
      const result = await askJson(context, {
        system: [
          "Ты — стратег Malik AI. Прочитай цель пользователя и верни бриф проекта одним JSON-объектом.",
          "Если пользователь не назвал идею продукта, предложи одну сильную и реалистичную идею, подходящую под его условия (страна, отрасль, аудитория), и опиши её конкретно.",
          `Все текстовые поля — на ${LANGUAGE_NAME[language]} языке, кроме queries: 3 поисковых запроса для исследования рынка (на русском и английском).`,
          NO_INVENTION,
        ].join(" "),
        prompt: [
          `Цель: ${clip(goal, 3_000)}`,
          "",
          'Формат: {"title":"","language":"ru|kk|en","country":"","industry":"","idea":"","audience":"","problem":"","solution":"","businessModel":"","deliverables":[""],"queries":["","",""],"constraints":[""]}',
        ].join("\n"),
        maxTokens: 1_600,
        normalize: (raw) => normalizeBrief(raw, goal),
      })
      brief = result.value
      provider = result.provider
    } catch (error) {
      // Retry the model first; the brief from the goal's own words is the last resort.
      if (context.signal.aborted || context.attempt < context.task.retry.maxAttempts) throw error
      brief = rulesBrief(goal)
      fallback = true
    }
    context.activity("Бриф готов", 0.9)
    const content = [
      `# ${brief.title}`,
      "",
      `**Идея.** ${brief.idea}`,
      brief.industry ? `**Отрасль.** ${brief.industry}${brief.country ? ` · ${brief.country}` : ""}` : "",
      brief.audience ? `**Аудитория.** ${brief.audience}` : "",
      brief.problem ? `**Проблема.** ${brief.problem}` : "",
      brief.solution ? `**Решение.** ${brief.solution}` : "",
      brief.businessModel ? `**Бизнес-модель.** ${brief.businessModel}` : "",
      fallback ? "\n_Бриф составлен по тексту запроса: модели не ответили вовремя._" : "",
    ].filter(Boolean).join("\n\n")
    return {
      provider,
      artifacts: [{
        projectId: context.project.id,
        kind: "text",
        title: "Бриф проекта",
        sourceTool: "goal.understand",
        sourceTask: context.task.id,
        content,
        summary: clip(brief.idea, 280),
        metadata: { role: "brief", brief, fallback: fallback ? "rules" : undefined },
      }],
      facts: {
        idea: clip(brief.idea, 300),
        industry: brief.industry,
        ...(brief.country ? { country: brief.country } : {}),
        ...(brief.audience ? { audience: clip(brief.audience, 240) } : {}),
        language: brief.language,
      },
    }
  },
}

/* ---------------------------------------------------------- research.web */

function sourceBlock(sources: WebSource[]) {
  return sources.map((source, index) => [
    `[${index + 1}] ${source.title} (${source.domain})${source.publishedAt ? ` · ${source.publishedAt}` : ""}`,
    clip(source.text || source.snippet || "", 1_600),
  ].join("\n")).join("\n\n")
}

export const researchTool: ToolDefinition = {
  name: "research.web",
  label: "Исследую рынок",
  sideEffect: "external",
  timeoutMs: 180_000,
  async run(context) {
    const brief = briefOf(context)
    const workResearch = context.task.input.workResearch === true
    const base = brief?.queries.length ? brief.queries : [clip(context.flow.goal, 120)]
    const queries = [...new Set(base.map((query) => clip(query, 160)).filter(Boolean))].slice(0, 3)
    context.activity(`Ищу источники: ${queries[0]}`, 0.1)
    const found = await context.deps.search(queries, {
      signal: context.signal,
      maxPages: 6,
      onStatus: (text) => context.activity(text, 0.35),
    })
    const usable = found.filter((source) => /^https?:\/\//i.test(source.url))
    const sources = (workResearch ? [...new Map(usable.map(source => [source.url, source])).values()] : usable).slice(0, 8)
    if (sources.length < 2) {
      throw new OsToolError("NO_SOURCES", "Поиск не вернул достаточно источников. Шаг можно повторить позже.", { retryable: true })
    }
    context.activity(`Читаю ${sources.length} источников`, 0.55)
    const language = (workResearch && requestedDeckLanguage(context.flow.goal)) || brief?.language || languageOf(context.flow.goal)
    const answer = await askText(context, {
      system: [
        workResearch ? "Изучи конкретный вопрос пользователя по приведённым источникам." : "Ты — аналитик рынка Malik AI. Пиши исследование ТОЛЬКО по приведённым источникам.",
        "Каждый факт и каждая цифра — с номером источника в квадратных скобках, например [2]. Номера только из списка.",
        "Если источники не дают цифру (размер рынка, рост), прямо напиши, что данных в источниках нет — не придумывай.",
        `Пиши на ${LANGUAGE_NAME[language]} языке в Markdown. ${workResearch ? "Разделы: ## Главное, ## Подтверждённые сведения, ## Что неизвестно." : "Разделы: ## Коротко, ## Рынок и спрос, ## Конкуренты и альтернативы, ## Тренды и возможности, ## Риски, ## Что это значит для проекта."}`,
      ].join(" "),
      prompt: `${projectContext(context)}\n\nИСТОЧНИКИ:\n${sourceBlock(sources)}`,
      maxTokens: context.flow.quality === "deep" ? 4_000 : 2_800,
      temperature: 0.3,
    })
    const numbered = sources.map((source, index) => ({ n: index + 1, title: clip(source.title, 160), url: source.url, domain: source.domain }))
    const now = context.deps.now()
    const projectSources: ProjectSource[] = numbered.map((source) => ({ url: source.url, title: source.title, domain: source.domain, at: now }))
    const summary = clip(answer.content.split(/\n## /)[1]?.replace(/^Коротко\s*/i, "") || answer.content, 300)
    return {
      provider: answer.provider,
      sources: projectSources,
      facts: workResearch ? undefined : { marketSummary: clip(summary.replace(/\[\d+\]/g, ""), 300) },
      artifacts: [{
        projectId: context.project.id,
        kind: "analysis",
        title: workResearch ? "Исследование по открытым источникам" : "Исследование рынка",
        sourceTool: "research.web",
        sourceTask: context.task.id,
        content: answer.content,
        summary,
        metadata: { role: "research", sources: numbered, queries, ...(workResearch ? { workResearch: true } : {}) },
      }],
    }
  },
}

/* ---------------------------------------------------------- brand.create */

export const brandTool: ToolDefinition = {
  name: "brand.create",
  label: "Создаю бренд",
  sideEffect: "none",
  timeoutMs: 120_000,
  async run(context) {
    const brief = briefOf(context)
    const language = brief?.language || languageOf(context.flow.goal)
    context.activity("Придумываю название и позиционирование", 0.2)
    const result = await askJson(context, {
      system: [
        "Ты — бренд-стратег Malik AI. Создай бренд для проекта: короткое запоминающееся название (1–2 слова, легко произносится на русском, казахском и английском, не занятое известными компаниями),",
        "слоган, позиционирование, ценности, тон, палитру из 5 цветов HEX и концепцию логотипа (знак без текста).",
        `Текст — на ${LANGUAGE_NAME[language]} языке. Верни один JSON-объект.`,
        NO_INVENTION,
      ].join(" "),
      prompt: [
        projectContext(context, { research: 2_500 }),
        "",
        'Формат: {"name":"","tagline":"","positioning":"","audience":"","values":[""],"voice":"","colors":{"primary":"#","secondary":"#","accent":"#","background":"#","text":"#"},"typography":"","logoConcept":"","nameRationale":""}',
        context.feedback ? "\nПредыдущий вариант не прошёл проверку — сделай полнее." : "",
      ].join("\n"),
      maxTokens: 1_800,
      normalize: normalizeBrand,
      temperature: 0.8,
    })
    const brand = result.value
    context.activity(`Бренд: ${brand.name}`, 0.9)
    const content = [
      `# ${brand.name}`,
      brand.tagline ? `> ${brand.tagline}` : "",
      "## Позиционирование",
      brand.positioning,
      brand.audience ? `## Аудитория\n${brand.audience}` : "",
      brand.values.length ? `## Ценности\n${brand.values.map((value) => `- ${value}`).join("\n")}` : "",
      brand.voice ? `## Тон\n${brand.voice}` : "",
      "## Палитра",
      Object.entries(brand.colors).map(([name, hex]) => `- ${name}: \`${hex}\``).join("\n"),
      brand.typography ? `## Шрифты\n${brand.typography}` : "",
      brand.logoConcept ? `## Логотип\n${brand.logoConcept}` : "",
      brand.nameRationale ? `## Почему это название\n${brand.nameRationale}` : "",
    ].filter(Boolean).join("\n\n")
    return {
      provider: result.provider,
      facts: { brandName: brand.name, ...(brand.tagline ? { tagline: brand.tagline } : {}), primaryColor: brand.colors.primary },
      decisions: [`Название бренда: ${brand.name}`],
      artifacts: [{
        projectId: context.project.id,
        kind: "text",
        title: `Бренд ${brand.name}`,
        sourceTool: "brand.create",
        sourceTask: context.task.id,
        content,
        summary: clip(`${brand.name} — ${brand.tagline || brand.positioning}`, 280),
        metadata: { role: "brand", brand },
      }],
    }
  },
}

/* ---------------------------------------------------------- business.plan */

export const businessPlanTool: ToolDefinition = {
  name: "business.plan",
  label: "Пишу бизнес-план",
  sideEffect: "none",
  timeoutMs: 300_000,
  async run(context) {
    const brief = briefOf(context)
    const brand = brandOf(context)
    const language = brief?.language || languageOf(context.flow.goal)
    context.activity("Пишу разделы плана", 0.2)
    const answer = await askText(context, {
      system: [
        "Ты — финансовый консультант и автор бизнес-планов для инвесторов Malik AI.",
        `Пиши на ${LANGUAGE_NAME[language]} языке, в Markdown, с разделами ##: Резюме, Проблема, Решение и продукт, Рынок (с цитатами [n] из исследования), Конкуренты, Бизнес-модель и юнит-экономика, Go-to-market, Операционный план, Команда (какие роли нужны — без выдуманных людей), Финансовый план на 3 года, Риски и как их снижать, Инвестиции: сколько нужно и на что. Если нет явных исходных данных для финансового прогноза — не вставляй придуманные суммы и таблицы; перечисли нужные входные показатели и расчётные формулы. Отделяй подтверждённые факты пользователя, проверенные источники, допущения и предложения.`,
        brand ? `Название компании везде — ${brand.name}.` : "",
        NO_INVENTION,
      ].join(" "),
      prompt: projectContext(context, { research: 5_000 }),
      maxTokens: context.flow.quality === "deep" ? 7_000 : 5_000,
    })
    context.activity("Проверяю цифры и разделы", 0.85)
    return {
      provider: answer.provider,
      artifacts: [{
        projectId: context.project.id,
        kind: "business-plan",
        title: brand ? `Бизнес-план ${brand.name}` : "Бизнес-план",
        sourceTool: "business.plan",
        sourceTask: context.task.id,
        content: answer.content,
        summary: clip(answer.content.split(/\n## /)[1]?.replace(/^Резюме\s*/i, "") || answer.content, 300),
        metadata: { role: "business-plan" },
      }],
    }
  },
}

/* -------------------------------------------------------- business.launch */

export const businessLaunchTool: ToolDefinition = {
  name: "business.launch",
  label: "Готовлю запуск и питч",
  sideEffect: "none",
  timeoutMs: 240_000,
  async run(context) {
    const plan = planOf(context)
    if (!plan?.content) throw new OsToolError("INVALID_INPUT", "Для плана запуска нужен бизнес-план проекта.", { retryable: false })
    const brand = brandOf(context)
    const brief = briefOf(context)
    const language = brief?.language || languageOf(context.flow.goal)
    context.activity("Планирую шаги на 7, 30 и 90 дней", 0.2)
    const answer = await askJson(context, {
      system: [
        `Ты — операционный стратег. Отвечай на ${LANGUAGE_NAME[language]} языке строго JSON-объектом.`,
        'Схема: {"roadmap":{"day7":{"outcome":"","actions":["",""],"evidence":[""]},"day30":{"outcome":"","actions":["",""],"evidence":[""]},"day90":{"outcome":"","actions":["",""],"evidence":[""]}},"pitches":{"seconds30":"","minutes2":"","minutes5":""},"openQuestions":[""]}.',
        "Действия должны быть конкретными для этой идеи, аудитории и страны. evidence — измеримые способы проверить шаги, не выдуманные достижения.",
        "Три питча различаются длиной и детализацией. Не называй неуказанные продажи, клиентов, инвестиции или членов команды фактом: сформулируй вопрос или оставь [уточнить].",
        "Укажи источники [n] только если они есть во входном исследовании. Избегай пустых стартап-штампов.",
        NO_INVENTION,
      ].join(" "),
      prompt: projectContext(context, { research: 3_500, plan: 5_000 }),
      maxTokens: 5_000,
      normalize: normalizeLaunchPack,
    })
    const pack = answer.value
    context.activity("Сверяю питч с бизнес-планом", 0.9)
    const link = { relation: "derived-from" as const, artifactId: plan.id }
    return {
      provider: answer.provider,
      artifacts: [
        { projectId: context.project.id, kind: "document", title: `План запуска ${brand?.name || "проекта"}`, sourceTool: "business.launch", sourceTask: context.task.id, content: roadmapMarkdown(pack), mime: "text/markdown", summary: "План на 7, 30 и 90 дней с проверяемыми результатами", links: [link], metadata: { role: "launch-roadmap", openQuestions: pack.openQuestions } },
        { projectId: context.project.id, kind: "document", title: `Питч ${brand?.name || "проекта"}`, sourceTool: "business.launch", sourceTask: context.task.id, content: pitchesMarkdown(pack), mime: "text/markdown", summary: "Питч на 30 секунд, 2 и 5 минут", links: [link], metadata: { role: "business-pitches", openQuestions: pack.openQuestions } },
      ],
    }
  },
}

/* ---------------------------------------------------------- video.script */

export const videoScriptTool: ToolDefinition = {
  name: "video.script",
  label: "Пишу сценарий видео",
  sideEffect: "none",
  timeoutMs: 150_000,
  async run(context) {
    const brief = briefOf(context)
    const brand = brandOf(context)
    const language = brief?.language || languageOf(context.flow.goal)
    const investors = /инвестор|investor|питч|pitch/iu.test(context.flow.goal)
    context.activity("Раскладываю ролик по сценам", 0.2)
    const answer = await askText(context, {
      system: [
        `Ты — сценарист коротких ${investors ? "питч-видео для инвесторов" : "промо-роликов"}. Ролик 60–90 секунд.`,
        `Пиши на ${LANGUAGE_NAME[language]} языке, Markdown. Для каждой сцены — заголовок "## Сцена N · 0:00–0:08", затем **Кадр:**, **Закадровый текст:**, **Текст на экране:**, **Звук:**.`,
        "6–9 сцен. В конце — раздел ## Промпты для генерации видео: по одному английскому промпту на сцену для видеомодели.",
        brand ? `Бренд — ${brand.name}${brand.tagline ? `, слоган «${brand.tagline}»` : ""}.` : "",
        NO_INVENTION,
      ].join(" "),
      prompt: projectContext(context, { research: 1_500, plan: 2_000 }),
      maxTokens: 3_000,
    })
    return {
      provider: answer.provider,
      artifacts: [{
        projectId: context.project.id,
        kind: "document",
        title: brand ? `Сценарий видео ${brand.name}` : "Сценарий видео",
        sourceTool: "video.script",
        sourceTask: context.task.id,
        content: answer.content,
        summary: clip(answer.content.replace(/[#*]/g, ""), 240),
        metadata: { role: "video-script", seconds: 90 },
      }],
    }
  },
}

/* --------------------------------------------------------- document.write */

export const documentTool: ToolDefinition = {
  name: "document.write",
  label: "Пишу документ",
  sideEffect: "none",
  timeoutMs: 240_000,
  async run(context) {
    const brief = briefOf(context)
    const workFormats = Array.isArray(context.task.input.workExportFormats) ? context.task.input.workExportFormats : []
    const workFile = workFormats.length > 0
    const goal = context.flow.goal
    const sheet = workFormats.includes("xlsx") || workFormats.includes("csv")
    const formulas = workFormats.includes("xlsx") && /(?:(?:с|и|добавь|with|and|include)\s+(?:excel\s+)?(?:формул|formulas)|формулалармен)/iu.test(goal)
    const charts = workFormats.includes("xlsx") && /(?:(?:с|и|добавь|with|and|include)\s+(?:a\s+)?(?:график|диаграмм|charts?|graphs?)|диаграммамен)/iu.test(goal)
    const language = (workFile && requestedDeckLanguage(goal)) || brief?.language || languageOf(goal)
    const instruction = String(context.task.input.instruction || "")
    const research = workFile ? researchOf(context) : null
    context.activity(sheet ? "Собираю таблицу" : "Пишу документ", 0.2)
    const answer = await askText(context, {
      system: [
        "Ты — редактор Malik AI. Напиши документ, который просит пользователь: ясная структура с заголовками ##, конкретика, без воды.",
        `Язык — ${LANGUAGE_NAME[language]}. Markdown.`,
        sheet ? "Основной результат — таблица Markdown со строкой заголовков, разделителем и данными. Сохраняй числа и единицы пользователя. Для шаблона оставляй неизвестные значения пустыми." : "",
        formulas ? "Помести запрошенные формулы Excel в ячейки таблицы, начиная с =. Используй локальные ссылки и стандартные арифметические операции или SUM, без внешних ссылок." : "",
        charts ? "Для диаграммы используй таблицу с категориями и числовыми значениями, полученными из данных пользователя. Сохрани нужные ряды в отдельных колонках." : "",
        research ? "Используй проверенные сведения ниже и ставь [n] рядом с каждым внешним фактом. Список ссылок добавится автоматически." : "",
        NO_INVENTION,
      ].join(" "),
      prompt: `${workFile ? `Подготовь содержимое для ${workFormats.join(" / ").toUpperCase()}. Запрос пользователя:\n${goal}${research ? `\n\nПодтверждённые сведения:\n${clip(research.text, 4_000)}` : ""}` : projectContext(context, { research: 3_000, plan: 3_000 })}${instruction ? `\n\nЗАДАНИЕ: ${clip(instruction, 2_000)}` : ""}`,
      maxTokens: context.flow.quality === "deep" ? 6_000 : 4_000,
      minChars: workFile ? 1 : undefined,
    })
    const title = answer.content.match(/^#\s+(.{2,120})$/m)?.[1] || "Документ"
    const sources = research?.sources || []
    const sourcesHeading = language === "en" ? "Sources" : language === "kk" ? "Дереккөздер" : "Источники"
    const links = sources.map(source => `${source.n}. ${source.title.replace(/[[\]\r\n]/g, " ")} — <${source.url}>`)
    return {
      provider: answer.provider,
      artifacts: [{
        projectId: context.project.id,
        kind: "document",
        title,
        sourceTool: "document.write",
        sourceTask: context.task.id,
        content: links.length ? `${answer.content}\n\n## ${sourcesHeading}\n\n${links.join("\n")}` : answer.content,
        summary: clip(answer.content.replace(/[#*]/g, ""), 260),
        metadata: { role: "document", ...(workFile ? { workFile: true, safeFormulas: formulas, charts, sources } : {}) },
      }],
    }
  },
}

/* -------------------------------------------------------- result.assemble */

const KIND_LABEL: Record<string, string> = {
  analysis: "исследование рынка",
  "business-plan": "бизнес-план",
  website: "сайт",
  presentation: "презентация",
  image: "изображение",
  document: "документ",
  code: "код проекта",
  text: "текст",
}

export const assembleTool: ToolDefinition = {
  name: "result.assemble",
  label: "Проверяю и собираю итог",
  sideEffect: "none",
  timeoutMs: 30_000,
  async run(context) {
    const brand = brandOf(context)
    const produced: Array<{ title: string; score?: number; kind: string; content?: string; checkedSource: boolean; formats?: string }> = []
    const missing: string[] = []
    for (const task of context.flow.tasks) {
      if (task.type === "result.assemble" || task.type === "goal.understand") continue
      const output = context.dependency(task.id.slice(task.id.lastIndexOf(".") + 1))
      if (output?.artifacts.length) {
        for (const artifact of output.artifacts) produced.push({
          title: artifact.title, score: artifact.validation?.score, kind: artifact.kind, content: artifact.content,
          checkedSource: artifact.metadata?.role === "work-source",
          formats: Array.isArray(task.input.workExportFormats) ? task.input.workExportFormats.join(" / ").toUpperCase() : undefined,
        })
      } else {
        missing.push(task.label)
      }
    }
    if (!produced.length) {
      throw new OsToolError("NOTHING_PRODUCED", "Ни один шаг не дал результата, собирать нечего. Повторите шаги с ошибкой.", { retryable: false })
    }
    const repositoryWork = context.flow.tasks.some(task => task.type === "github.work")
    const fileWork = context.flow.tasks.some(task => Array.isArray(task.input.workExportFormats))
    context.activity(repositoryWork ? "Собираю отчёт и предлагаемые файлы" : fileWork ? "Сверяю готовые файлы со списком задач" : "Сверяю бренд во всех материалах", 0.5)
    // Consistency: the brand name should appear in every text deliverable.
    const inconsistent = brand
      ? produced.filter((item) => item.content && ["website", "presentation", "business-plan"].includes(item.kind) && !item.content.toLowerCase().includes(brand.name.toLowerCase())).map((item) => item.title)
      : []
    const lines = [
      brand ? `# ${brand.name}${brand.tagline ? ` — ${brand.tagline}` : ""}` : "# Итог",
      "",
      "## Готово",
      ...produced.map((item) => `- **${item.title}** — ${item.formats || (fileWork && item.kind === "analysis" ? "источники" : KIND_LABEL[item.kind] || item.kind)}${item.formats ? " · проверен экспорт" : !repositoryWork && typeof item.score === "number" ? ` · проверка ${item.score}/100` : ""}`),
      repositoryWork ? "\n## Границы результата\nПредложение изменений не является выполненным commit. Build и unit tests: NOT RUN; синтаксические проверки перечислены в отчёте GitHub." : "",
      produced.some(item => item.checkedSource) ? "\nИсходники прошли статические проверки. Сборка и тесты не запускались." : "",
      missing.length ? `\n## Не получилось\n${missing.map((label) => `- ${label} — можно повторить этот шаг`).join("\n")}` : "",
      inconsistent.length ? `\n## Требует внимания\n${inconsistent.map((title) => `- В «${title}» не найдено название ${brand?.name}`).join("\n")}` : "",
      planOf(context) || researchOf(context) ? "\n## Дальше\n- Откройте любой результат и попросите изменить его — остальные материалы проекта это учтут." : "",
    ]
    return {
      artifacts: [{
        projectId: context.project.id,
        kind: "text",
        title: "Итог проекта",
        sourceTool: "result.assemble",
        sourceTask: context.task.id,
        content: lines.filter((line) => line !== "").join("\n"),
        summary: `Готово: ${produced.length}${missing.length ? ` · не получилось: ${missing.length}` : ""}`,
        metadata: { role: "summary", produced: produced.length, missing, inconsistent, ...(fileWork ? { workFile: true } : {}) },
      }],
    }
  },
}
