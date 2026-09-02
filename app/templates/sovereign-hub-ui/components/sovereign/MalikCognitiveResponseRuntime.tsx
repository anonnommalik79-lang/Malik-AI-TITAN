"use client"

import { useEffect } from "react"

type CognitiveMode =
  | "direct"
  | "explain"
  | "compare"
  | "decision"
  | "procedure"
  | "troubleshoot"
  | "code"
  | "business"
  | "research"
  | "numeric"

type CognitiveLocale = "ru" | "kk" | "en"

type CognitivePlan = {
  mode: CognitiveMode
  label: string
  flow: string[]
}

type DualCopy = {
  title: string
  subtitle: string
  answerOne: string
  answerTwo: string
  full: string
  concise: string
  prefer: string
  selected: string
  mobileHint: string
}

const MODE_COPY: Record<CognitiveLocale, Record<CognitiveMode, { label: string; flow: string[] }>> = {
  ru: {
    direct: { label: "DIRECT", flow: ["Ответ", "Главное"] },
    explain: { label: "EXPLAIN", flow: ["Смысл", "Пример", "Главное"] },
    compare: { label: "COMPARE", flow: ["Критерии", "Сравнение", "Победитель"] },
    decision: { label: "DECISION", flow: ["Сигналы", "Риски", "Решение", "Следующий ход"] },
    procedure: { label: "ACTION PATH", flow: ["Цель", "Шаги", "Проверка"] },
    troubleshoot: { label: "DIAGNOSE", flow: ["Симптом", "Причина", "Фикс", "Проверка"] },
    code: { label: "CODE", flow: ["Задача", "Решение", "Проверка"] },
    business: { label: "STRATEGY", flow: ["Ценность", "Риск", "Решение", "Действие"] },
    research: { label: "EVIDENCE", flow: ["Факты", "Источники", "Вывод"] },
    numeric: { label: "NUMBERS", flow: ["Данные", "Расчёт", "Итог"] },
  },
  kk: {
    direct: { label: "DIRECT", flow: ["Жауап", "Негізгісі"] },
    explain: { label: "EXPLAIN", flow: ["Мағына", "Мысал", "Негізгісі"] },
    compare: { label: "COMPARE", flow: ["Критерий", "Салыстыру", "Жеңімпаз"] },
    decision: { label: "DECISION", flow: ["Сигнал", "Тәуекел", "Шешім", "Келесі қадам"] },
    procedure: { label: "ACTION PATH", flow: ["Мақсат", "Қадамдар", "Тексеру"] },
    troubleshoot: { label: "DIAGNOSE", flow: ["Белгі", "Себеп", "Түзету", "Тексеру"] },
    code: { label: "CODE", flow: ["Міндет", "Шешім", "Тексеру"] },
    business: { label: "STRATEGY", flow: ["Құндылық", "Тәуекел", "Шешім", "Әрекет"] },
    research: { label: "EVIDENCE", flow: ["Факт", "Дереккөз", "Қорытынды"] },
    numeric: { label: "NUMBERS", flow: ["Дерек", "Есеп", "Қорытынды"] },
  },
  en: {
    direct: { label: "DIRECT", flow: ["Answer", "Key point"] },
    explain: { label: "EXPLAIN", flow: ["Meaning", "Example", "Key point"] },
    compare: { label: "COMPARE", flow: ["Criteria", "Comparison", "Winner"] },
    decision: { label: "DECISION", flow: ["Signals", "Risks", "Verdict", "Next move"] },
    procedure: { label: "ACTION PATH", flow: ["Goal", "Steps", "Verify"] },
    troubleshoot: { label: "DIAGNOSE", flow: ["Symptom", "Cause", "Fix", "Verify"] },
    code: { label: "CODE", flow: ["Task", "Solution", "Verify"] },
    business: { label: "STRATEGY", flow: ["Value", "Risk", "Decision", "Action"] },
    research: { label: "EVIDENCE", flow: ["Facts", "Sources", "Conclusion"] },
    numeric: { label: "NUMBERS", flow: ["Inputs", "Math", "Result"] },
  },
}

const DUAL_COPY: Record<CognitiveLocale, DualCopy> = {
  ru: {
    title: "Какой ответ вам полезнее?",
    subtitle: "Для важных запросов Malik показывает две версии из одного ответа — без второго вызова модели.",
    answerOne: "Ответ 1",
    answerTwo: "Ответ 2",
    full: "Полный",
    concise: "Сжатый",
    prefer: "Я предпочитаю этот ответ",
    selected: "Выбрано",
    mobileHint: "Смахните, чтобы сравнить",
  },
  kk: {
    title: "Қай жауап пайдалырақ?",
    subtitle: "Маңызды сұрауларда Malik бір жауаптан екі нұсқа көрсетеді — модельді екінші рет шақырмай.",
    answerOne: "Жауап 1",
    answerTwo: "Жауап 2",
    full: "Толық",
    concise: "Қысқа",
    prefer: "Осы жауапты таңдаймын",
    selected: "Таңдалды",
    mobileHint: "Салыстыру үшін сырғытыңыз",
  },
  en: {
    title: "Which answer is more useful?",
    subtitle: "For important questions Malik shows two views from one answer, with no second model call.",
    answerOne: "Answer 1",
    answerTwo: "Answer 2",
    full: "Full",
    concise: "Focused",
    prefer: "I prefer this answer",
    selected: "Selected",
    mobileHint: "Swipe to compare",
  },
}

function localeFor(text: string): CognitiveLocale {
  if (/[әіңғүұқөһ]/iu.test(text)) return "kk"
  if (/[а-яё]/iu.test(text)) return "ru"
  return "en"
}

function classifyRequest(raw: string): CognitiveMode {
  const text = String(raw || "").toLowerCase().trim()
  if (!text) return "direct"

  if (/не работает|ошибк|сломал|исправ|почин|debug|\bfix\b|failed|error|issue/u.test(text)) return "troubleshoot"
  if (/стоит ли|что выбрать|какой выбрать|лучше|рекоменду|решени|should i|choose|recommend|best option/u.test(text)) return "decision"
  if (/сравн|разниц|\bvs\b|versus|compare|отлич/u.test(text)) return "compare"
  if (/как сделать|как настро|как добав|пошаг|инструкц|how to|steps|guide/u.test(text)) return "procedure"
  if (/бизнес|стартап|рынок|клиент|продаж|выручк|маркетинг|startup|business|market|revenue/u.test(text)) return "business"
  if (/код|typescript|javascript|python|react|next\.?js|api|sql|css|html|github|коммит|function/u.test(text)) return "code"
  if (/исслед|источник|доказ|новост|сегодня|актуальн|research|source|evidence|latest|today/u.test(text)) return "research"
  if (/сколько|процент|стоим|бюджет|метрик|расч|\d|percent|cost|budget/u.test(text)) return "numeric"
  if (/что такое|объясн|почему|как работает|explain|what is|why/u.test(text)) return "explain"
  return text.length > 90 ? "explain" : "direct"
}

function planFor(text: string): CognitivePlan {
  const locale = localeFor(text)
  const mode = classifyRequest(text)
  const copy = MODE_COPY[locale][mode]
  return { mode, label: copy.label, flow: copy.flow }
}

function previousUserRow(row: Element): HTMLElement | null {
  let current = row.previousElementSibling
  while (current) {
    if (current.getAttribute("data-malik-message") === "user") return current as HTMLElement
    current = current.previousElementSibling
  }
  return null
}

function nextAssistantRow(row: Element): HTMLElement | null {
  let current = row.nextElementSibling
  while (current) {
    if (current.getAttribute("data-malik-message") === "assistant") return current as HTMLElement
    if (current.getAttribute("data-malik-message") === "user") return null
    current = current.nextElementSibling
  }
  return null
}

function isCompletedAssistant(row: HTMLElement | null) {
  if (!row) return false
  return !row.querySelector(".malik-ai-avatar.is-working")
}

function addLightningReaction(userRow: HTMLElement) {
  if (userRow.querySelector(":scope .malik-user-lightning-reaction")) return
  const assistant = nextAssistantRow(userRow)
  if (!isCompletedAssistant(assistant)) return

  const stack = userRow.querySelector(":scope > .malik-message-stack") as HTMLElement | null
  if (!stack) return

  const reaction = document.createElement("span")
  reaction.className = "malik-user-lightning-reaction"
  reaction.textContent = "⚡"
  reaction.setAttribute("aria-label", "Malik AI reaction")
  reaction.setAttribute("title", "Malik AI")
  stack.appendChild(reaction)
}

function addCognitiveStrip(assistantRow: HTMLElement) {
  if (assistantRow.querySelector(":scope .malik-cognitive-response")) return
  if (assistantRow.querySelector(".malik-ai-avatar.is-working")) return

  const card = assistantRow.querySelector(".malik-message-card-assistant") as HTMLElement | null
  if (!card) return

  const userRow = previousUserRow(assistantRow)
  const request = userRow?.textContent?.replace("⚡", "").trim() || ""
  if (!request) return

  const plan = planFor(request)
  const responseText = card.textContent?.trim() || ""
  const detailed = responseText.length >= 180 || request.length >= 70 || plan.mode !== "direct"

  const shell = document.createElement("div")
  shell.className = `malik-cognitive-response mode-${plan.mode}`
  shell.setAttribute("data-malik-cognitive-mode", plan.mode)

  const strip = document.createElement("div")
  strip.className = "malik-cognitive-strip"

  const brand = document.createElement("span")
  brand.className = "malik-cognitive-brand"
  brand.innerHTML = "<b>⚡</b><strong>MALIK</strong>"

  const mode = document.createElement("span")
  mode.className = "malik-cognitive-mode"
  mode.textContent = plan.label

  strip.append(brand, mode)
  shell.appendChild(strip)

  if (detailed) {
    const flow = document.createElement("div")
    flow.className = "malik-cognitive-flow"
    plan.flow.forEach((label, index) => {
      const node = document.createElement("span")
      node.className = "malik-cognitive-node"
      node.textContent = label
      flow.appendChild(node)
      if (index < plan.flow.length - 1) {
        const arrow = document.createElement("i")
        arrow.textContent = "→"
        arrow.setAttribute("aria-hidden", "true")
        flow.appendChild(arrow)
      }
    })
    shell.appendChild(flow)
  }

  card.parentElement?.insertBefore(shell, card)
}

function importantForDual(plan: CognitivePlan, request: string, responseText: string, markdown: HTMLElement) {
  if (responseText.length < 280 || markdown.children.length < 4) return false
  if (markdown.querySelector(".malik-md-codeblock")) return false
  if (/\b(кратко|коротко|brief|short|concise|қысқа)\b/iu.test(request)) return false

  if (["compare", "decision", "business", "research", "numeric"].includes(plan.mode)) return true
  return plan.mode === "explain" && request.length >= 170 && responseText.length >= 520
}

function scrubClone(root: HTMLElement) {
  root.removeAttribute("id")
  root.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"))
  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => button.remove())
}

function focusedClone(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement
  scrubClone(clone)

  const blocks = Array.from(clone.children) as HTMLElement[]
  if (blocks.length <= 4) return clone

  const decisive = /(итог|вывод|решен|рекоменд|лучше|побед|риск|следующ|главн|вердикт|қорытынды|шешім|ұсын|тәуекел|келесі|негізгі|verdict|conclusion|recommend|winner|best|risk|next|key point)/iu
  const keep = new Set<number>([0, 1])

  let anchor = -1
  for (let index = 1; index < blocks.length; index += 1) {
    if (decisive.test(blocks[index].textContent || "")) {
      anchor = index
      break
    }
  }

  if (anchor >= 0) {
    keep.add(anchor)
    if (anchor + 1 < blocks.length) keep.add(anchor + 1)
    if (anchor + 2 < blocks.length && keep.size < 5) keep.add(anchor + 2)
  } else {
    keep.add(2)
    if (blocks.length > 4) keep.add(3)
  }

  const last = blocks.length - 1
  if (decisive.test(blocks[last].textContent || "") || keep.size < 4) keep.add(last)

  blocks.forEach((block, index) => {
    if (!keep.has(index)) block.remove()
  })
  return clone
}

function preferenceKey(request: string, response: string) {
  const value = `${request}\u0000${response.slice(0, 320)}`
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `malik-dual-pref:${(hash >>> 0).toString(36)}`
}

function makeCandidate(
  index: 1 | 2,
  body: HTMLElement,
  copy: DualCopy,
  compact: boolean,
) {
  const card = document.createElement("article")
  card.className = "malik-dual-card"
  card.setAttribute("data-answer", String(index))

  const header = document.createElement("header")
  header.className = "malik-dual-card__header"

  const identity = document.createElement("span")
  identity.className = "malik-dual-card__identity"
  const mark = document.createElement("i")
  mark.textContent = "⚡"
  mark.setAttribute("aria-hidden", "true")
  const label = document.createElement("strong")
  label.textContent = index === 1 ? copy.answerOne : copy.answerTwo
  identity.append(mark, label)

  const kind = document.createElement("span")
  kind.className = "malik-dual-card__kind"
  kind.textContent = compact ? copy.concise : copy.full
  header.append(identity, kind)

  const content = document.createElement("div")
  content.className = "malik-dual-card__content"
  content.appendChild(body)

  const choose = document.createElement("button")
  choose.type = "button"
  choose.className = "malik-dual-card__choose"
  choose.textContent = copy.prefer

  card.append(header, content, choose)
  return { card, choose }
}

function addDualAnswer(assistantRow: HTMLElement) {
  if (assistantRow.querySelector(":scope .malik-dual-answer")) return
  if (!isCompletedAssistant(assistantRow)) return

  const card = assistantRow.querySelector(".malik-message-card-assistant") as HTMLElement | null
  const markdown = card?.querySelector(":scope .malik-md") as HTMLElement | null
  if (!card || !markdown) return

  const userRow = previousUserRow(assistantRow)
  const request = userRow?.textContent?.replace("⚡", "").trim() || ""
  if (!request) return

  const plan = planFor(request)
  const responseText = markdown.textContent?.trim() || ""
  if (!importantForDual(plan, request, responseText, markdown)) return

  const locale = localeFor(request)
  const copy = DUAL_COPY[locale]
  const full = markdown.cloneNode(true) as HTMLElement
  scrubClone(full)
  const focused = focusedClone(markdown)

  const shell = document.createElement("section")
  shell.className = "malik-dual-answer"
  shell.setAttribute("aria-label", copy.title)

  const intro = document.createElement("div")
  intro.className = "malik-dual-intro"
  const title = document.createElement("strong")
  title.textContent = copy.title
  const subtitle = document.createElement("span")
  subtitle.textContent = copy.subtitle
  const mobileHint = document.createElement("small")
  mobileHint.textContent = copy.mobileHint
  intro.append(title, subtitle, mobileHint)

  const grid = document.createElement("div")
  grid.className = "malik-dual-grid"

  const one = makeCandidate(1, full, copy, false)
  const two = makeCandidate(2, focused, copy, true)
  grid.append(one.card, two.card)
  shell.append(intro, grid)

  const storageKey = preferenceKey(request, responseText)
  const applySelection = (selected: "1" | "2" | null) => {
    const pairs = [one, two] as const
    pairs.forEach((candidate, position) => {
      const value = String(position + 1) as "1" | "2"
      const active = selected === value
      candidate.card.setAttribute("data-selected", active ? "1" : "0")
      candidate.choose.textContent = active ? copy.selected : copy.prefer
      candidate.choose.setAttribute("aria-pressed", active ? "true" : "false")
    })
  }

  let saved: "1" | "2" | null = null
  try {
    const value = window.localStorage.getItem(storageKey)
    saved = value === "1" || value === "2" ? value : null
  } catch {
    saved = null
  }
  applySelection(saved)

  one.choose.addEventListener("click", () => {
    try { window.localStorage.setItem(storageKey, "1") } catch { /* best effort */ }
    applySelection("1")
  })
  two.choose.addEventListener("click", () => {
    try { window.localStorage.setItem(storageKey, "2") } catch { /* best effort */ }
    applySelection("2")
  })

  markdown.classList.add("malik-dual-source-hidden")
  card.insertBefore(shell, markdown)
}

function decorateMalikChat() {
  const root = document.getElementById("malik-root")
  if (!root) return

  root.querySelectorAll<HTMLElement>('[data-malik-message="user"]').forEach(addLightningReaction)
  root.querySelectorAll<HTMLElement>('[data-malik-message="assistant"]').forEach((row) => {
    addCognitiveStrip(row)
    addDualAnswer(row)
  })
}

/**
 * Zero-token presentation layer.
 *
 * The model still makes one normal request. This runtime reads the already
 * rendered turn and adds Malik response DNA, the ⚡ reaction and — for important
 * questions — a full + focused two-answer comparison. No second LLM call, no
 * hidden provider request and no extra provider tokens are used.
 */
export function MalikCognitiveResponseRuntime() {
  useEffect(() => {
    let queued = false
    const run = () => {
      queued = false
      decorateMalikChat()
    }
    const schedule = () => {
      if (queued) return
      queued = true
      window.requestAnimationFrame(run)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  return null
}

export default MalikCognitiveResponseRuntime
