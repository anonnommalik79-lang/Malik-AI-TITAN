import type { DeckOutline, Slide, SlideLayout } from "@/lib/presentations/types"

/**
 * Lightweight, deterministic editorial QA for decks and outlines.
 * This is NOT a fact checker. No network, model calls, storage or credits.
 * It deliberately asks for evidence instead of pretending to verify it.
 */
export type PresentationQualityIssue = {
  slideIndex: number
  code: "duplicate" | "filler" | "repeated-layout" | "no-notes" | "unattributed-data" | "missing-photo" | "low-variety" | "crowded-slide" | "missing-slide"
  message: string
  recommendation: string
  weight: number
}
export type PresentationQualityReport = {
  score: number
  issues: PresentationQualityIssue[]
  inspected: number
  ready: number
}

const FILLER = /^(?:введение|заключение|выводы|обзор|информация|о нас|основные моменты|рынок|продукт|решение|проблема|важность|introduction|overview|conclusion|our solution|market|the problem|about us|key points|қорытынды|кіріспе)$/iu
const PLACEHOLDER = /\b(?:lorem ipsum|insert here|placeholder|coming soon|to be determined|tbd)\b|(?:вставьте текст|здесь будет|укажите значение|данные уточняются)/iu
const EVIDENCE = /(?:источник|по данным|согласно|source|according to|dataset|зерттеу|дереккөз|расчёт|расчет|методология|methodology|получено из)/iu

function headline(slide: Slide | null | undefined, fallback = ""): string {
  if (!slide) return fallback
  return "title" in slide ? slide.title : slide.layout === "quote" ? slide.quote : fallback
}

function keyOf(title: string) {
  return title.toLocaleLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

/**
 * Scores visible writing, structural variety and presenter readiness.
 * An editorial score of 100 does not mean that facts have been verified.
 */
export function inspectPresentation(input: {
  outline: DeckOutline | null
  slides?: Array<Slide | null>
}): PresentationQualityReport {
  const items = input.outline?.items || []
  const slides = input.slides || []
  const inspected = Math.max(items.length, slides.length)
  const issues: PresentationQualityIssue[] = []
  const seen = new Map<string, number>()
  const layouts: SlideLayout[] = []

  const flag = (
    slideIndex: number,
    code: PresentationQualityIssue["code"],
    message: string,
    recommendation: string,
    weight: number,
  ) => issues.push({ slideIndex, code, message, recommendation, weight })

  for (let i = 0; i < inspected; i += 1) {
    const slide = slides[i]
    // Incomplete decks cannot earn 100/100 while the outline-only preview
    // remains an editorial review, not a failed generation.
    if (input.slides !== undefined && !slide) {
      flag(i, "missing-slide", "Слайд не создан", "Завершите генерацию или повторите создание этого слайда.", 15)
      continue
    }
    const title = headline(slide, items[i]?.title || "").trim()
    const layout = slide?.layout || items[i]?.layout || "bullets"
    layouts.push(layout)
    const key = keyOf(title)

    if (key && seen.has(key)) {
      flag(i, "duplicate", "Повторяется заголовок слайда", "Дайте слайду отдельный вывод или объедините повторяющиеся мысли.", 12)
    } else if (key) {
      seen.set(key, i)
    }

    if (FILLER.test(title) && i > 0 && i < inspected - 1) {
      flag(i, "filler", "Заголовок называет тему, а не вывод", "Напишите конкретное утверждение, которое этот слайд доказывает.", 7)
    }
    if (PLACEHOLDER.test(title)) {
      flag(i, "filler", "На слайде осталась заглушка", "Замените заглушку конкретным фактом или честно обозначьте отсутствие данных.", 10)
    }

    if (i >= 2 && layout === layouts[i - 1] && layout === layouts[i - 2] && layout !== "section") {
      flag(i, "repeated-layout", "Три одинаковых макета подряд", "Смените композицию: сравнение, процесс, визуализация или ключевая цифра.", 5)
    }

    if (!slide) continue
    // Words moved into speaker notes stay available to the presenter instead
    // of being squeezed into a tiny projected slide. This is a heuristic:
    // never claim to have measured text bounds or silently delete material.
    const long = (value?: string) => (value || "").trim().length
    const crowded =
      (slide.layout === "bullets" && slide.points.length >= 5 &&
        (slide.points.some((point) => long(point.body) > 125) ||
          slide.points.reduce((sum, point) => sum + long(point.title) + long(point.body), 0) > 490)) ||
      (slide.layout === "cards" && slide.cards.length >= 4 &&
        slide.cards.some((card) => long(card.body) > 115)) ||
      (slide.layout === "comparison" && slide.rows.length >= 6 &&
        slide.rows.some((row) => row.values.some((value) => long(value) > 60))) ||
      (slide.layout === "quote" && long(slide.quote) > 220) ||
      (slide.layout === "image-text" && long(slide.body) > 300 && slide.points.length >= 3)
    if (crowded) {
      flag(i, "crowded-slide", "Слишком много текста для комфортного показа",
        "Сократите подписи, не удаляя важные факты: перенесите детали в заметки докладчика.", 8)
    }
    if ((!slide.notes || slide.notes.trim().length < 30) && slide.layout !== "section") {
      flag(i, "no-notes", "Нет содержательных заметок докладчика", "Добавьте аргумент, пояснение и переход к следующему слайду.", 3)
    }
    if ((slide.layout === "chart" || slide.layout === "stat") && !EVIDENCE.test([slide.notes, "context" in slide ? slide.context : ""].join(" "))) {
      flag(i, "unattributed-data", "Для чисел не указан проверяемый источник", "Добавьте источник, период и метод расчёта в заметки. Оценка не подтверждает правильность цифр.", 8)
    }
    if ((slide.layout === "hero" || slide.layout === "image-text") && !slide.imageUrl && !slide.imageQuery && !slide.imagePrompt) {
      flag(i, "missing-photo", "Визуальный слайд без изображения и задания для него", "Добавьте тематическое фото или перепишите визуальный запрос.", 5)
    }
  }

  if (inspected >= 6 && new Set(layouts).size <= 2) {
    flag(0, "low-variety", "Презентация визуально однообразна", "Чередуйте фотографии, сравнения, карточки, процессы и диаграммы.", 12)
  }

  const score = Math.max(0, Math.round(100 - issues.reduce((sum, issue) => sum + issue.weight, 0)))
  return { score, issues, inspected, ready: slides.filter(Boolean).length }
}
