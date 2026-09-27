import { OsToolError } from "../failures"
import type { DeckOutlineResult, DeckSlide, ToolDefinition } from "./contract"
import { brandOf, briefOf, clip, languageOf, logoOf, planOf, projectContext, researchOf } from "./shared"

/* --------------------------------------------------------- image.generate */

export const imageTool: ToolDefinition = {
  name: "image.generate",
  label: "Рисую логотип",
  sideEffect: "paid",
  timeoutMs: 180_000,
  async run(context) {
    const brand = brandOf(context)
    const brief = briefOf(context)
    const purpose = String(context.task.input.purpose || "logo")
    if (!context.task.charged) {
      const credit = await context.deps.image.check(context.owner)
      if (!credit.ok) throw new OsToolError("NO_CREDITS", credit.message, { retryable: false, action: "upgrade" })
    }
    const prompt = purpose === "logo"
      ? [
          `Minimal modern logo mark for a company called ${brand?.name || brief?.title || "a startup"}`,
          brief?.industry ? `in ${brief.industry}` : "",
          brand?.logoConcept ? `. Concept: ${clip(brand.logoConcept, 300)}` : "",
          brand ? `. Colors ${brand.colors.primary} and ${brand.colors.accent}` : "",
          ". Flat vector symbol, centered on a plain white background, crisp geometric shapes, generous margins, no text, no letters, no mockup, no watermark.",
        ].join(" ").replace(/\s+/g, " ").trim()
      : clip(String(context.task.input.prompt || context.flow.goal), 900)
    context.activity(purpose === "logo" ? "Рисую знак бренда" : "Рисую изображение", 0.3)
    const result = await context.deps.image.generate({
      prompt,
      aspectRatio: purpose === "logo" ? "1:1" : "16:9",
      mode: purpose === "logo" ? "design" : "cinematic",
      owner: context.owner,
      signal: context.signal,
    })
    if (!/^https:\/\//i.test(result.url)) {
      throw new OsToolError("IMAGE_NOT_STORED", "Изображение получено, но его негде сохранить: облачное хранилище не настроено.", { retryable: false })
    }
    if (!context.task.charged) {
      await context.deps.image.record(context.owner)
      await context.markCharged()
    }
    return {
      provider: result.providerModel ? `${result.provider}/${result.providerModel}` : result.provider,
      artifacts: [{
        projectId: context.project.id,
        kind: "image",
        title: purpose === "logo" ? `Логотип ${brand?.name || ""}`.trim() : "Изображение",
        sourceTool: "image.generate",
        sourceTask: context.task.id,
        url: result.url,
        mime: "image/*",
        summary: clip(prompt, 240),
        metadata: { role: purpose, prompt, ephemeral: result.ephemeral, durable: result.durable, delivery: result.ephemeral ? "provider-direct" : "object-storage" },
      }],
    }
  },
}

/* ---------------------------------------------------------- site.generate */

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string)
}

/** Puts the generated logo next to the brand name in the site's header. */
export function withLogo(html: string, logoUrl: string, name: string) {
  if (!/^https:\/\//i.test(logoUrl)) return html
  const mark = `<img src="${escapeHtml(logoUrl)}" alt="" width="28" height="28" style="width:28px;height:28px;border-radius:7px;object-fit:cover;vertical-align:-7px;margin-right:9px" loading="lazy" referrerpolicy="no-referrer">`
  let replaced = false
  const next = html.replace(/<a class="brand" href="#top">/, (match) => {
    replaced = true
    return `${match}${mark}`
  })
  return replaced ? next : html.replace(/<title>/i, `<link rel="icon" href="${escapeHtml(logoUrl)}"><title>`)
}

export const siteTool: ToolDefinition = {
  name: "site.generate",
  label: "Собираю сайт",
  sideEffect: "none",
  timeoutMs: 330_000,
  async run(context) {
    const brand = brandOf(context)
    const brief = briefOf(context)
    const research = researchOf(context)
    const language = brief?.language || languageOf(context.flow.goal)
    const request = [
      `Создай лендинг для компании ${brand?.name || brief?.title || ""}.`,
      brief ? `Продукт: ${brief.idea}. Аудитория: ${brief.audience || "—"}. Проблема: ${brief.problem || "—"}. Решение: ${brief.solution || "—"}.` : `Задача: ${clip(context.flow.goal, 1_200)}`,
      brand ? `Название бренда строго «${brand.name}». Слоган: «${brand.tagline}». Позиционирование: ${brand.positioning}. Тон: ${brand.voice}. Акцентный цвет ${brand.colors.accent}.` : "",
      research ? `Факты о рынке для блока статистики (только из исследования, с источником): ${clip(research.text.replace(/\n+/g, " "), 900)}` : "",
      `Язык сайта: ${language}. Не выдумывай отзывы клиентов, логотипы партнёров и цифры без источника — используй разделы «как это работает», «для кого», «преимущества», «тарифы (ориентировочно)», «FAQ», «контакты».`,
      context.feedback ? `Исправь: ${context.feedback.checks.filter((check) => !check.ok).map((check) => check.note).join("; ")}.` : "",
    ].filter(Boolean).join("\n")
    context.activity("Планирую структуру сайта", 0.2)
    const result = await context.deps.site({ prompt: request, userId: context.owner.userId, signal: context.signal })
    context.activity("Верстаю страницы", 0.75)
    let html = result.html
    // The planner may rename the company; the brand decided earlier wins.
    if (brand && result.plan.brand?.name && result.plan.brand.name !== brand.name && !html.includes(brand.name)) {
      html = html.split(escapeHtml(result.plan.brand.name)).join(escapeHtml(brand.name))
    }
    const logo = logoOf(context)
    if (logo?.url) html = withLogo(html, logo.url, brand?.name || "")
    return {
      provider: result.plannerUsed ? `${result.provider}/${result.model}` : "malik-skill-renderer",
      artifacts: [{
        projectId: context.project.id,
        kind: "website",
        title: brand ? `Сайт ${brand.name}` : "Сайт",
        sourceTool: "site.generate",
        sourceTask: context.task.id,
        content: html,
        mime: "text/html",
        summary: clip(`${result.plan.hero?.title || ""}`, 240),
        links: logo ? [{ relation: "derived-from", artifactId: logo.id }] : [],
        metadata: {
          role: "website",
          planScore: result.quality.score,
          planIssues: result.quality.issues.slice(0, 6),
          plannerUsed: result.plannerUsed,
          // Said out loud: without a model's plan the renderer used its own layout.
          fallback: result.plannerUsed ? undefined : "skill-renderer",
        },
      }],
    }
  },
}

/* --------------------------------------------------- presentation.generate */

const BATCH = 4

export const presentationTool: ToolDefinition = {
  name: "presentation.generate",
  label: "Готовлю презентацию",
  sideEffect: "paid",
  timeoutMs: 480_000,
  async run(context) {
    const brand = brandOf(context)
    const brief = briefOf(context)
    const plan = planOf(context)
    const research = researchOf(context)
    const investors = context.task.input.audience === "investors"
    const language = brief?.language || languageOf(context.flow.goal)
    const maxSlides = await context.deps.presentation.maxSlides(context.owner)
    const count = Math.max(6, Math.min(investors ? 11 : 10, maxSlides))
    const topic = [
      investors ? `Инвестиционная презентация (pitch deck) компании ${brand?.name || brief?.title || ""}.` : `Презентация: ${brief?.title || clip(context.flow.goal, 200)}.`,
      investors ? "Порядок: титул, проблема, решение, продукт, рынок, бизнес-модель, go-to-market, конкуренты, финансовый план, команда (роли), инвестиции и следующий шаг." : "",
      brief ? `Идея: ${brief.idea}. Аудитория: ${brief.audience}.` : "",
      brand ? `Бренд: ${brand.name} — ${brand.tagline}.` : "",
      plan?.content ? `Опирайся на бизнес-план: ${clip(plan.content, 3_000)}` : "",
      research ? `Факты рынка (с источниками): ${clip(research.text, 1_200)}` : "",
      "Не выдумывай трекшн, клиентов и имена. Прогнозы — только как оценки.",
    ].filter(Boolean).join("\n")

    // A retry after a completed charge (storage hiccup) must not pay twice.
    const prepaid = Boolean(context.task.charged)
    const cost = 1 + count
    if (!prepaid) {
      const reservation = await context.deps.presentation.reserve(context.owner, cost)
      if (!reservation.ok) throw new OsToolError("NO_CREDITS", reservation.message, { retryable: false, action: "upgrade" })
    }
    let refund = prepaid ? 0 : cost
    try {
      context.activity("Составляю план слайдов", 0.1)
      const outline: DeckOutlineResult = await context.deps.presentation.outline({ topic, count, language, signal: context.signal })
      if (!prepaid) refund -= 1
      const written = new Map<number, DeckSlide>()
      const starts: number[] = []
      for (let index = 0; index < outline.items.length; index += BATCH) starts.push(index)
      let done = 0
      // Two batches at a time: fast, and never more than the studio itself uses.
      for (let offset = 0; offset < starts.length; offset += 2) {
        if (context.signal.aborted) throw new OsToolError("CANCELLED", "Отменено.", { retryable: false })
        const group = starts.slice(offset, offset + 2)
        const results = await Promise.allSettled(group.map((start) => context.deps.presentation.slides({
          topic,
          outline,
          startIndex: start,
          count: Math.min(BATCH, outline.items.length - start),
          language,
        })))
        for (const result of results) {
          if (result.status !== "fulfilled") continue
          for (const item of result.value.slides) written.set(item.index, item.slide)
        }
        done = written.size
        context.activity(`Пишу слайды: ${done} из ${outline.items.length}`, 0.15 + 0.75 * (done / outline.items.length))
      }
      const slides = [...written.entries()].sort((a, b) => a[0] - b[0]).map(([, slide]) => slide)
      if (!prepaid) refund -= slides.length
      if (slides.length < Math.min(6, outline.items.length)) {
        // No deck is delivered, so nothing of it is paid for.
        if (!prepaid) refund = cost
        throw new OsToolError("SLIDES_FAILED", "Модель не дописала слайды. Кредиты за них не списаны — повторю.", { retryable: true })
      }
      const logo = logoOf(context)
      if (logo?.url && slides[0] && ["title", "hero", "image-text"].includes(String(slides[0].layout))) {
        slides[0] = { ...slides[0], imageUrl: logo.url }
      }
      const now = context.deps.now()
      const deck = {
        id: `deck-${context.task.id.replace(/[^\w-]/g, "").slice(-40)}`,
        title: outline.title || (brand ? `${brand.name}` : "Презентация"),
        theme: "obsidian",
        language,
        slides,
        prompt: clip(topic, 3_900),
        createdAt: now,
        updatedAt: now,
      }
      if (!prepaid) await context.markCharged()
      return {
        artifacts: [{
          projectId: context.project.id,
          kind: "presentation",
          title: investors ? `Investor Deck ${brand?.name || ""}`.trim() : deck.title,
          sourceTool: "presentation.generate",
          sourceTask: context.task.id,
          content: JSON.stringify(deck),
          mime: "application/vnd.malik.deck+json",
          summary: `${slides.length} слайдов · ${deck.title}`,
          links: [plan, logo].filter(Boolean).map((artifact) => ({ relation: "derived-from" as const, artifactId: artifact!.id })),
          metadata: { role: investors ? "investor-deck" : "presentation", slides: slides.length, missing: outline.items.length - slides.length },
        }],
      }
    } finally {
      if (refund > 0) await context.deps.presentation.refund(context.owner, refund).catch(() => undefined)
    }
  },
}

/* ----------------------------------------------------------- code.project */

export const codeTool: ToolDefinition = {
  name: "code.project",
  label: "Пишу код проекта",
  sideEffect: "none",
  timeoutMs: 600_000,
  async run(context) {
    const instruction = String(context.task.input.instruction || "")
    const prompt = [projectContext(context, { research: 800 }), instruction ? `\nЗАДАНИЕ: ${clip(instruction, 2_000)}` : ""].join("")
    context.activity("Проектирую файлы", 0.1)
    const result = await context.deps.code({ prompt, userId: context.owner.userId, signal: context.signal })
    if (!result.qaPassed) {
      throw new OsToolError("CODE_QA_FAILED", result.error || "Проект не прошёл проверку сборки. Повторю.", { retryable: true })
    }
    const files = result.files.slice(0, 80)
    let content = JSON.stringify({ files })
    // Only the source that fits; the full project stays downloadable as a zip.
    while (content.length > 380_000 && files.length > 1) {
      files.pop()
      content = JSON.stringify({ files, truncated: true })
    }
    return {
      provider: `${result.provider}/${result.model}`,
      artifacts: [{
        projectId: context.project.id,
        kind: "code",
        title: result.title || "Проект",
        sourceTool: "code.project",
        sourceTask: context.task.id,
        content,
        mime: "application/vnd.malik.files+json",
        summary: `${result.files.length} файлов`,
        metadata: { role: "code", qaPassed: true, downloadUrl: result.downloadUrl, fileCount: result.files.length },
      }],
    }
  },
}
