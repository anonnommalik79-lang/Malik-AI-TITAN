import type { ArtifactDraft } from "./store"
import type { ValidationReport } from "./types"

/**
 * Self-check: every artifact is inspected before its task is marked done.
 * The checks are deterministic (structure, completeness, consistency with
 * the brand, no placeholders, citations that point at real sources), so a
 * failed check is a fact the retry can fix, not a model's opinion.
 */

type Check = { id: string; ok: boolean; note: string; required?: boolean }

export type ValidationContext = { brandName?: string; sourceCount?: number; language?: "ru" | "kk" | "en" }

const PLACEHOLDER = /lorem ipsum|\[(?:вставьте|insert|название|company|имя)[^\]]*\]|<(?:название|company name)>|TODO:|XXX|placeholder/i

function headings(markdown: string) {
  return (markdown.match(/^#{1,3}\s+\S/gm) || []).length
}

function mentions(text: string, name?: string) {
  if (!name) return true
  return text.toLowerCase().includes(name.toLowerCase())
}

function citations(text: string) {
  return [...text.matchAll(/\[(\d{1,2})\]/g)].map((match) => Number(match[1]))
}

function cyrillicShare(text: string) {
  const letters = text.match(/\p{L}/gu) || []
  if (!letters.length) return 0
  return (text.match(/[Ѐ-ӿ]/g) || []).length / letters.length
}

export function validateArtifact(draft: ArtifactDraft, context: ValidationContext = {}, now = Date.now()): ValidationReport {
  const content = String(draft.content || "")
  const checks: Check[] = []
  const add = (id: string, ok: boolean, note: string, required = true) => checks.push({ id, ok, note, required })

  const role = String(draft.metadata?.role || "")

  if (draft.kind === "website") {
    add("html", /<html[\s>]/i.test(content) && /<\/html>/i.test(content), "сайт должен быть полным HTML-документом")
    add("viewport", /name=["']viewport["']/i.test(content), "нужен meta viewport для телефона")
    add("title", /<title>[^<]{2,}<\/title>/i.test(content), "нужен заголовок страницы <title>")
    add("description", /<meta\s+name=["']description["'][^>]+content=["'][^"']{20,}["']/i.test(content), "нужно содержательное SEO-описание", false)
    add("og-metadata", /property=["']og:title["']/i.test(content) && /property=["']og:description["']/i.test(content), "нужны метаданные для публикации ссылки", false)
    add("structured-data", /type=["']application\/ld\+json["']/i.test(content), "нет структурированных данных", false)
    add("semantic", /<main[\s>]/i.test(content) && /<nav[\s>]/i.test(content) && /<h1[\s>]/i.test(content), "нужны main, nav и заголовок h1", false)
    add("responsive-css", /@media\s*\(max-width:/i.test(content), "нет CSS-правил для мобильных экранов", false)
    add("skip-link", /class=["']skip-link["']/i.test(content), "нет ссылки перехода к содержимому", false)
    add("sections", (content.match(/<section[\s>]/gi) || []).length >= 3, "на сайте должно быть минимум три раздела")
    add("brand", mentions(content, context.brandName), `название бренда «${context.brandName}» должно быть на сайте`)
    add("placeholder", !PLACEHOLDER.test(content), "на сайте остались заглушки")
    add("size", content.length > 3_000, "сайт получился слишком коротким")
  } else if (draft.kind === "presentation") {
    let slides: Array<Record<string, unknown>> = []
    try {
      slides = (JSON.parse(content) as { slides?: Array<Record<string, unknown>> }).slides || []
    } catch {
      slides = []
    }
    add("slides", slides.length >= 6, "в презентации должно быть минимум 6 слайдов")
    add("titles", slides.every((slide) => Object.values(slide).some((value) => typeof value === "string" && value.trim().length > 2)), "у каждого слайда должен быть текст")
    add("brand", mentions(content, context.brandName), `название «${context.brandName}» должно быть в презентации`)
    add("placeholder", !PLACEHOLDER.test(content), "в презентации остались заглушки")
  } else if (draft.kind === "image") {
    add("url", /^https:\/\//i.test(String(draft.url || "")), "у изображения должен быть адрес")
  } else if (draft.kind === "code") {
    let files: unknown[] = []
    try {
      files = (JSON.parse(content) as { files?: unknown[] }).files || []
    } catch {
      files = []
    }
    add("files", files.length >= 1, "в проекте нет файлов")
    add("qa", draft.metadata?.qaPassed === true, "проект не прошёл проверку сборки")
  } else if (draft.kind === "analysis" && role === "data") {
    add("tables", /\|---/.test(content), "в анализе должна быть таблица статистики")
    add("profile", Boolean(draft.metadata?.profile), "нет посчитанного профиля данных")
  } else if (draft.kind === "analysis") {
    const cited = citations(content)
    const count = context.sourceCount || 0
    add("sources", count >= 2, "нужно минимум два источника")
    add("citations", cited.length >= 2, "выводы должны ссылаться на источники [n]")
    add("citation-range", cited.every((n) => n >= 1 && n <= count), "ссылки [n] должны указывать на существующие источники")
    add("structure", headings(content) >= 3, "нужны разделы с заголовками")
  } else if (draft.kind === "business-plan") {
    add("structure", headings(content) >= 7, "в бизнес-плане должно быть минимум 7 разделов")
    add("brand", mentions(content, context.brandName), `название «${context.brandName}» должно быть в плане`)
    add("finance", /финанс|выручк|revenue|unit|юнит|расход|доход/i.test(content), "нужен финансовый раздел")
    add("assumptions", !/\d/.test(content) || /оценк|допущ|предполож|assum|estimate|\[\d+\]/i.test(content), "цифры без источника должны быть помечены как оценка")
    add("placeholder", !PLACEHOLDER.test(content), "в плане остались заглушки")
    add("length", content.length > 2_500, "бизнес-план слишком короткий")
  } else {
    // text and document (brand book, brief, video script, summary …)
    add("length", content.length > (role === "summary" || role === "brief" ? 60 : 400), "текст слишком короткий")
    add("placeholder", !PLACEHOLDER.test(content), "в тексте остались заглушки")
    if (role === "brand") add("brand-name", Boolean(context.brandName || draft.metadata?.brand), "у бренда должно быть название")
    if (role === "video-script") add("scenes", (content.match(/^#{2,3}\s|^\*\*(?:сцена|scene|кадр)/gim) || []).length >= 4, "в сценарии должно быть минимум 4 сцены")
    if (role === "video-script" || role === "document") add("brand", mentions(content, context.brandName), `название «${context.brandName}» должно быть в тексте`, false)
  }

  if (context.language && context.language !== "en" && draft.kind !== "image" && draft.kind !== "code" && content.length > 400) {
    add("language", cyrillicShare(content.replace(/<[^>]+>/g, " ")) > 0.35, "ответ должен быть на языке запроса", false)
  }

  const required = checks.filter((check) => check.required !== false)
  const passed = checks.filter((check) => check.ok).length
  return {
    ok: required.every((check) => check.ok),
    score: checks.length ? Math.round((passed / checks.length) * 100) : 100,
    checks: checks.map(({ id, ok, note }) => ({ id, ok, note })),
    checkedAt: now,
  }
}
