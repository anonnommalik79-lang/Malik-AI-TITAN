"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Pencil, Square, Volume2 } from "lucide-react"

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

export function UserMessageActions({ text, onEdit }: { text: string; onEdit?: (text: string) => void }) {
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
        <button type="button" onClick={() => onEdit(text)} title="Изменить и отправить заново" aria-label="Изменить сообщение">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ follow-ups */

const FOLLOW_UPS = [
  { label: "Подробнее", text: "Объясни подробнее, с деталями и примерами." },
  { label: "Короче", text: "Сократи ответ до самого главного — 3–5 пунктов." },
  { label: "Пример", text: "Приведи конкретный практический пример." },
  { label: "Таблицей", text: "Оформи этот ответ в виде таблицы." },
]

export function FollowUpChips({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  return (
    <div className="malik-follow-ups" role="group" aria-label="Продолжить разговор">
      {FOLLOW_UPS.map((item) => (
        <button key={item.label} type="button" disabled={disabled} onClick={() => onSend(item.text)}>{item.label}</button>
      ))}
    </div>
  )
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
