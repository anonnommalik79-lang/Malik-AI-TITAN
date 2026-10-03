"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Download, Pencil, Square, Volume2 } from "lucide-react"

/**
 * Small things that make the chat feel like a mature assistant, all real
 * and all local to the browser:
 * - read an answer aloud (the browser's own speech engine, Russian, Kazakh
 *   or English by the text), one answer at a time;
 * - copy or edit your own message (edit puts it back in the composer);
 * - follow-up chips under the newest answer;
 * - keyboard shortcuts: Shift+Esc focuses the composer, Ctrl/⌘+Shift+C
 *   copies the last answer, Ctrl/⌘+Shift+; copies its last code block, ↑ in
 *   an empty composer brings back your last message.
 */

/* ------------------------------------------------------------ read aloud */

/** Markdown without the symbols a voice would read out loud. */
export function speakableText(markdown: string) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " Пример кода пропущен. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/[*_~>#]+/g, "")
    .replace(/\[\d{1,2}\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function speechLanguage(text: string) {
  if (/[әғқңөұүһі]/iu.test(text)) return "kk-KZ"
  const cyrillic = (text.match(/[а-яё]/giu) || []).length
  const latin = (text.match(/[a-z]/gi) || []).length
  return cyrillic >= latin ? "ru-RU" : "en-US"
}

/** Sentences packed into pieces short enough for every speech engine. */
export function speechChunks(text: string, max = 220) {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text]
  const chunks: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if ((current + sentence).length > max && current) {
      chunks.push(current.trim())
      current = ""
    }
    if (sentence.length > max) {
      for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max).trim())
    } else {
      current += sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

let speakingOwner: string | null = null
const speakingListeners = new Set<() => void>()
function setSpeakingOwner(owner: string | null) {
  speakingOwner = owner
  speakingListeners.forEach((listener) => listener())
}

function pickVoice(lang: string) {
  const voices = window.speechSynthesis.getVoices()
  const base = lang.slice(0, 2)
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(base))
    // No Kazakh voice on this device: Russian reads Kazakh text best.
    || (base === "kk" ? voices.find((voice) => voice.lang.toLowerCase().startsWith("ru")) : undefined)
    || null
}

export function ReadAloudButton({ id, text }: { id: string; text: string }) {
  const [, force] = useState(0)
  const supported = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"
  useEffect(() => {
    const listener = () => force((value) => value + 1)
    speakingListeners.add(listener)
    return () => {
      speakingListeners.delete(listener)
      if (speakingOwner === id) {
        window.speechSynthesis?.cancel()
        setSpeakingOwner(null)
      }
    }
  }, [id])
  if (!supported) return null
  const speaking = speakingOwner === id

  const toggle = () => {
    const synth = window.speechSynthesis
    synth.cancel()
    if (speaking) {
      setSpeakingOwner(null)
      return
    }
    const clean = speakableText(text)
    if (!clean) return
    const lang = speechLanguage(clean)
    const voice = pickVoice(lang)
    const chunks = speechChunks(clean)
    setSpeakingOwner(id)
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.lang = voice?.lang || lang
      if (voice) utterance.voice = voice
      utterance.rate = 1.03
      if (index === chunks.length - 1) utterance.onend = () => { if (speakingOwner === id) setSpeakingOwner(null) }
      utterance.onerror = () => { if (speakingOwner === id) setSpeakingOwner(null) }
      synth.speak(utterance)
    })
  }

  return (
    <button
      type="button"
      title={speaking ? "Остановить чтение" : "Прочитать вслух"}
      aria-label={speaking ? "Остановить чтение" : "Прочитать ответ вслух"}
      aria-pressed={speaking}
      onClick={toggle}
      className={`malik-read-aloud rounded-md p-1 hover:bg-white/10 hover:text-white${speaking ? " is-speaking" : ""}`}
    >
      {speaking ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  )
}

/* ------------------------------------------------------- your own message */

export function UserMessageActions({ id, text, onEdit }: { id: string; text: string; onEdit?: (id: string, text: string) => void }) {
  const [copied, setCopied] = useState(false)
  if (!text.trim()) return null
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* The text can still be selected by hand. */
    }
  }
  return (
    <div className="malik-user-actions" role="group" aria-label="Действия с сообщением">
      <button type="button" onClick={copy} title={copied ? "Скопировано" : "Копировать"} aria-label={copied ? "Скопировано" : "Копировать сообщение"}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {onEdit ? (
        <button type="button" onClick={() => onEdit(id, text)} title="Изменить и создать новую ветку" aria-label="Изменить сообщение и создать ветку">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ follow-ups */

type FollowUp = { label: string; text: string; research?: boolean }
export type FollowUpSendOptions = { research?: boolean }

type FollowUpLocale = "ru" | "kk" | "en"
function followUpLocale(question: string): FollowUpLocale {
  if (/[әіңғүұқөһ]/iu.test(question)) return "kk"
  if (/[а-яё]/iu.test(question)) return "ru"
  return "en"
}

/** Action chips are contextual, translated, and never pretend an action ran.
 * Research is explicitly forwarded to the existing server-side search path. */
export function buildContextualFollowUps(question: string, answer: string): FollowUp[] {
  const locale = followUpLocale(question || answer)
  const copy: Record<FollowUpLocale, Record<string, FollowUp>> = {
    ru: {
      more: { label: "Подробнее", text: "Объясни свой предыдущий ответ подробнее, с конкретными деталями." },
      short: { label: "Короче", text: "Сократи предыдущий ответ до 3–5 главных пунктов без потери смысла." },
      simple: { label: "Проще", text: "Объясни предыдущий ответ простыми словами, без лишнего жаргона." },
      example: { label: "Пример", text: "Покажи конкретный практический пример по предыдущему ответу." },
      steps: { label: "Пошагово", text: "Преврати предыдущий ответ в проверяемую пошаговую инструкцию. Не придумывай расположение элементов интерфейса." },
      code: { label: "Проверь код", text: "Проверь код из предыдущего ответа на ошибки и безопасность; предложи исправленный вариант и объясни изменения." },
      math: { label: "Проверь расчёт", text: "Независимо перепроверь все вычисления предыдущего ответа с подстановкой и единицами измерения." },
      table: { label: "Таблицей", text: "Структурируй предыдущий ответ в понятную сравнительную таблицу, сохранив факты и ограничения." },
      fact: { label: "Проверить факты", text: "Проверь ключевые проверяемые факты из предыдущего ответа по доступным актуальным источникам, укажи ссылки и что не удалось подтвердить.", research: true },
    },
    kk: {
      more: { label: "Толығырақ", text: "Алдыңғы жауабыңды нақты мәліметтермен кеңірек түсіндір." },
      short: { label: "Қысқаша", text: "Алдыңғы жауапты мағынасын жоғалтпай 3–5 негізгі тармаққа қысқарт." },
      simple: { label: "Оңайлат", text: "Алдыңғы жауапты күрделі терминдерсіз қарапайым тілмен түсіндір." },
      example: { label: "Мысал", text: "Алдыңғы жауапқа қатысты нақты практикалық мысал келтір." },
      steps: { label: "Қадамдар", text: "Алдыңғы жауапты тексеруге болатын қадамдық нұсқаулыққа айналдыр. Интерфейс элементтерінің орнын ойдан шығарма." },
      code: { label: "Кодты тексер", text: "Алдыңғы жауаптағы кодты қате мен қауіпсіздік тұрғысынан тексер, түзетілген нұсқа мен түсіндірме бер." },
      math: { label: "Есепті тексер", text: "Алдыңғы есептеулерді мәндерді қойып, өлшем бірліктерімен қайта тексер." },
      table: { label: "Кесте", text: "Алдыңғы жауапты фактілері мен шектеулерін сақтап, түсінікті кестеге айналдыр." },
      fact: { label: "Деректі тексер", text: "Алдыңғы жауаптағы негізгі деректерді қолжетімді өзекті дереккөздерден тексер, сілтемелер мен расталмаған тұстарын көрсет.", research: true },
    },
    en: {
      more: { label: "More detail", text: "Expand on your previous answer with concrete details." },
      short: { label: "Shorter", text: "Condense your previous answer to 3–5 essential points without losing nuance." },
      simple: { label: "Simplify", text: "Explain your previous answer in plain language with minimal jargon." },
      example: { label: "Example", text: "Give one concrete, practical example of your previous answer." },
      steps: { label: "Steps", text: "Turn your previous answer into verifiable steps. Do not invent UI positions." },
      code: { label: "Review code", text: "Check the code from your previous answer for bugs and security issues. Provide corrected code and explain each change." },
      math: { label: "Check math", text: "Independently verify all calculations in your previous answer, including substituted values and units." },
      table: { label: "As a table", text: "Turn your previous answer into a clear comparison table, preserving facts and caveats." },
      fact: { label: "Verify facts", text: "Check key verifiable claims in your previous answer against available current sources. Cite them and flag what could not be confirmed.", research: true },
    },
  }
  const items = copy[locale]
  const isCode = /```|\b(code|coding|python|javascript|typescript|програм|код|функци|бағдарлама|кодты)\b/iu.test(question + "\n" + answer.slice(0, 300))
  const isMath = /(?:[=+×÷∑√]|\b(?:математ|алгебр|уравнен|расч[её]т|есеп|теңдеу|equation|calculate|integral)\b)/iu.test(question)
  const isProcedure = /(?:\b(?:как|как сделать|настрой|установ|пошаг|how to|steps|setup|install|қалай|орнат|баптау)\b)/iu.test(question)
  const special = isCode ? items.code : isMath ? items.math : isProcedure ? items.steps : items.table
  return [items.more, items.short, items.simple, items.example, special, ...(isCode || isMath ? [] : [items.fact])]
}

export function FollowUpChips({ onSend, question = "", answer = "", disabled }: {
  onSend: (text: string, options?: FollowUpSendOptions) => void
  question?: string
  answer?: string
  disabled?: boolean
}) {
  const actions = buildContextualFollowUps(question, answer)
  return (
    <div className="malik-follow-ups" role="group" aria-label="Продолжить разговор">
      {actions.map((item) => (
        <button key={item.label} type="button" disabled={disabled}
          title={item.research ? "Запустить проверку по доступным источникам" : undefined}
          onClick={() => onSend(item.text, { research: item.research })}>{item.label}</button>
      ))}
    </div>
  )
}

/** A real, offline Markdown export. No server request or phantom PDF action. */
export function AnswerDownloadButton({ text }: { text: string }) {
  const download = () => {
    if (!text.trim()) return
    const date = new Date()
    const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
    const blob = new Blob([text.trim() + "\n"], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `malik-ai-answer-${stamp}.md`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return <button type="button" onClick={download} title="Скачать ответ (.md)" aria-label="Скачать ответ в Markdown"
    className="rounded-md p-1 hover:bg-white/10 hover:text-white"><Download className="h-4 w-4" /></button>
}

/* -------------------------------------------------------------- shortcuts */

export function lastCodeBlock(markdown: string) {
  const blocks = [...String(markdown || "").matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
  return blocks.length ? blocks[blocks.length - 1][1].replace(/\n$/, "") : ""
}

type ShortcutMessage = { role: "user" | "assistant"; content: string }

export function useChatShortcuts(input: {
  messages: ShortcutMessage[]
  focusComposer: () => void
  composerEmpty: () => boolean
  restoreLastPrompt: (text: string) => void
  notify: (text: string) => void
}) {
  const { messages, focusComposer, composerEmpty, restoreLastPrompt, notify } = input
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      const target = event.target as HTMLElement | null
      const inComposer = Boolean(target?.closest?.("[data-composer]"))
      if (event.key === "Escape" && event.shiftKey) {
        event.preventDefault()
        focusComposer()
        return
      }
      if (mod && event.shiftKey && (event.key === "C" || event.key === "c" || event.code === "KeyC")) {
        const last = [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim())
        if (!last) return
        event.preventDefault()
        void navigator.clipboard?.writeText(last.content).then(() => notify("Последний ответ скопирован."), () => undefined)
        return
      }
      if (mod && event.shiftKey && (event.key === ";" || event.code === "Semicolon")) {
        const last = [...messages].reverse().find((message) => message.role === "assistant" && lastCodeBlock(message.content))
        if (!last) return
        event.preventDefault()
        void navigator.clipboard?.writeText(lastCodeBlock(last.content)).then(() => notify("Последний блок кода скопирован."), () => undefined)
        return
      }
      if (event.key === "ArrowUp" && !mod && !event.shiftKey && !event.altKey && inComposer && target?.tagName === "TEXTAREA" && composerEmpty()) {
        const last = [...messages].reverse().find((message) => message.role === "user" && message.content.trim())
        if (!last) return
        event.preventDefault()
        restoreLastPrompt(last.content)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [composerEmpty, focusComposer, messages, notify, restoreLastPrompt])
}

/* ------------------------------------------------------- thought trace */

function seconds(ms: number) {
  const value = Math.max(1, Math.round(ms / 1000))
  if (value < 60) return `${value} с`
  const minutes = Math.floor(value / 60)
  return `${minutes} мин ${value % 60} с`
}

/**
 * "Думал 4 с" above a finished answer, like the reasoning line in ChatGPT.
 * It opens to the steps the server actually reported (searching, reading a
 * site, writing) — operational status, never the model's hidden reasoning.
 */
export function ThoughtTrace({ thought, sources = 0 }: { thought: { ms: number; steps: string[] }; sources?: number }) {
  const [open, setOpen] = useState(false)
  const steps = thought.steps.filter(Boolean)
  const label = `Думал ${seconds(thought.ms)}${sources ? ` · источников: ${sources}` : ""}`
  if (!steps.length) return <div className="malik-thought"><span className="malik-thought__label">{label}</span></div>
  return (
    <div className={`malik-thought${open ? " is-open" : ""}`}>
      <button type="button" className="malik-thought__label" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {label}
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? (
        <ol className="malik-thought__steps">
          {steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
        </ol>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------ answer versions */

/** "‹ 2/3 ›" under an answer that was regenerated. */
export function VersionPager({ index, total, onChange }: { index: number; total: number; onChange: (index: number) => void }) {
  if (total < 2) return null
  return (
    <span className="malik-versions" role="group" aria-label="Версии ответа">
      <button type="button" disabled={index <= 0} onClick={() => onChange(index - 1)} aria-label="Предыдущая версия">‹</button>
      <span aria-live="polite">{index + 1}/{total}</span>
      <button type="button" disabled={index >= total - 1} onClick={() => onChange(index + 1)} aria-label="Следующая версия">›</button>
    </span>
  )
}
