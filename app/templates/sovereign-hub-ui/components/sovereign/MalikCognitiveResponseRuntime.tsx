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

function decorateMalikChat() {
  const root = document.getElementById("malik-root")
  if (!root) return

  root.querySelectorAll<HTMLElement>('[data-malik-message="user"]').forEach(addLightningReaction)
  root.querySelectorAll<HTMLElement>('[data-malik-message="assistant"]').forEach(addCognitiveStrip)
}

/**
 * Zero-token presentation layer.
 *
 * The model still makes one normal request. This runtime only reads the already
 * rendered user/assistant turns and adds Malik's task-native response DNA plus
 * the ⚡ reaction in the browser. No second LLM call, no hidden prompt, no
 * extra provider tokens.
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
