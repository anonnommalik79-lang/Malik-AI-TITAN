"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Bot,
  Check,
  ChevronRight,
  Code,
  Copy,
  FilePlus2,
  FileText,
  FolderTree,
  Github,
  Globe,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Maximize2,
  Mic,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  SendHorizontal,
  Share,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Video,
  Volume2,
  Wand2,
  X,
  Zap,
  Brain,
  Crown,
} from "lucide-react"
import type { GenerationStatusType } from "./generation-status"
import type { AIPlan } from "@/lib/ai/types"
import {
  canUseUltra,
  loadResponseDepth,
  saveResponseDepth,
  type ChatSendOptions,
  type ResponseDepth,
} from "@/lib/ai/response-depth"

export type { ChatSendOptions }

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isStreaming?: boolean
  username?: string
  generatedMedia?: InlineMediaGeneration
}

export interface ChatAttachment {
  id: string
  name: string
  mime: string
  size: number
  kind: "image" | "video" | "audio" | "file" | "code" | "url"
  base64?: string
  text?: string
  url?: string
}

type InlineMediaGenerationStatus = "queued" | "thinking" | "generating" | "rendering" | "ready" | "failed"

export type InlineMediaGeneration = {
  id: string
  kind: "image" | "video"
  status: InlineMediaGenerationStatus
  prompt: string
  provider?: string
  progress?: number
  url?: string
  thumbnailUrl?: string
  error?: string
  createdAt?: string
}

interface ChatViewProps {
  messages: Message[]
  onSendMessage: (message: string, attachments?: ChatAttachment[], options?: ChatSendOptions) => void
  isLoading?: boolean
  streamingText?: string
  currentUser?: string
  userPlan?: AIPlan
  onOpenCodex?: () => void
  onForceCanvas?: () => void
}

const MAX_FILE_SIZE = 12 * 1024 * 1024

function getInitials(value?: string) {
  const clean = (value || "US").replace(/@.*/, "").trim()
  return (clean.slice(0, 2) || "US").toUpperCase()
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (file.size > MAX_FILE_SIZE) throw new Error(`Файл слишком большой: ${file.name}. Лимит 12MB.`)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })
  const base64 = dataUrl.includes(",") ? dataUrl.split(",").pop() || "" : dataUrl
  const mime = file.type || "application/octet-stream"
  const kind: ChatAttachment["kind"] = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : "file"
  return { id: crypto.randomUUID(), name: file.name, mime, size: file.size, kind, base64 }
}

function detectGenerationStatusType(text: string): GenerationStatusType {
  const value = text.toLowerCase()
  if (/image|photo|picture|фото|изображ|картин|нарисуй/.test(value)) return "image"
  if (/video|видео|ролик|runway|анимац/.test(value)) return "video"
  if (/file|document|pdf|word|txt|файл|документ/.test(value)) return "file"
  if (/codex|agent|агент|папк|файлы|структур|project/.test(value)) return "codex"
  if (/code|react|tsx|typescript|javascript|python|debug|код|ошиб|фикс/.test(value)) return "code"
  if (/website|site|landing|dashboard|ui|html|canvas|preview|app|сайт|лендинг|дашборд|интерфейс|шаблон/.test(value)) return "website"
  return "text"
}

function AttachmentPill({ item, onRemove }: { item: ChatAttachment; onRemove: () => void }) {
  const Icon = item.kind === "image" ? ImageIcon : item.kind === "video" ? Video : item.kind === "audio" ? Volume2 : item.kind === "code" ? Code : item.kind === "url" ? LinkIcon : FileText
  return (
    <div className="group flex max-w-full items-center gap-2 rounded-xl border border-cyan-300/12 bg-white/[0.045] px-3 py-2 text-xs text-slate-300">
      <Icon className="h-4 w-4 shrink-0 text-violet-300" />
      <span className="truncate">{item.name || item.url}</span>
      <button type="button" onClick={onRemove} className="ml-1 rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-white">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function GeminiMediaGenerationCard({ media }: { media: InlineMediaGeneration }) {
  const isVideo = media.kind === "video"
  const isReady = media.status === "ready" && Boolean(media.url)
  const isFailed = media.status === "failed"
  const progress = Math.min(100, Math.max(4, media.progress ?? (isReady ? 100 : isFailed ? 100 : 18)))
  const statusLabel: Record<InlineMediaGenerationStatus, string> = {
    queued: "Очередь",
    thinking: "Понимаю идею",
    generating: isVideo ? "Генерирую видео" : "Генерирую изображение",
    rendering: isVideo ? "Рендерю сцену" : "Собираю финальный кадр",
    ready: "Готово",
    failed: "Ошибка генерации",
  }

  return (
    <div className="relative w-full max-w-[620px] overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-3 shadow-[0_28px_90px_rgba(0,0,0,.42)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(34,211,238,.18),transparent_36%),radial-gradient(circle_at_82%_78%,rgba(139,92,246,.18),transparent_38%)]" />
      <div className="relative overflow-hidden rounded-[1.55rem] border border-white/10 bg-black/45">
        <div className="aspect-square w-full">
          {isReady && media.url ? (
            isVideo ? (
              <video src={media.url} poster={media.thumbnailUrl} controls playsInline className="h-full w-full rounded-[1.55rem] object-cover" />
            ) : (
              <img src={media.url} alt={media.prompt || "Generated media"} className="h-full w-full rounded-[1.55rem] object-cover" />
            )
          ) : (
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.55rem] bg-[#050507]">
              <div className="absolute h-52 w-52 rounded-full bg-cyan-400/18 blur-[60px]" />
              <div className="absolute h-72 w-72 rounded-full bg-violet-500/16 blur-[80px]" />
              <div className="absolute inset-8 rounded-[2rem] border border-white/10 bg-white/[0.035]" />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_0_45px_rgba(139,92,246,.22)] backdrop-blur-xl">
                  {isVideo ? <Video className="h-7 w-7 text-cyan-100" /> : <ImageIcon className="h-7 w-7 text-cyan-100" />}
                </div>
                <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-white/70">Malik AI {isVideo ? "Video" : "Image"}</p>
                <p className="mt-2 max-w-[280px] text-sm leading-6 text-zinc-400">{isFailed ? media.error || "Провайдер вернул ошибку." : "Генератор работает прямо внутри чата."}</p>
              </div>
            </div>
          )}
        </div>

        {!isReady && !isFailed && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/62 p-3 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black uppercase tracking-[0.18em] text-white">{statusLabel[media.status]}</p>
                <p className="mt-1 truncate text-[11px] text-zinc-500">{media.provider || "Media API"} · {Math.round(progress)}%</p>
              </div>
              <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-cyan-200" />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-3 rounded-[1.25rem] border border-white/10 bg-black/35 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/65">
            {isVideo ? <Video className="h-3.5 w-3.5 text-cyan-200" /> : <ImageIcon className="h-3.5 w-3.5 text-cyan-200" />}
            {isVideo ? "Video generation" : "Image generation"}
          </span>
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]", isReady ? "bg-emerald-300/12 text-emerald-100" : isFailed ? "bg-red-400/12 text-red-100" : "bg-cyan-300/12 text-cyan-100")}>{statusLabel[media.status]}</span>
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-zinc-300">{media.prompt}</p>
        {isReady && media.url && (
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={media.url} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-cyan-50">Открыть результат</a>
            <button type="button" onClick={() => navigator.clipboard?.writeText(media.url || "")} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-zinc-300 transition hover:bg-white/10">Copy link</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingBubble({ generationType }: { generationType: GenerationStatusType }) {
  const labelMap: Record<GenerationStatusType, string> = {
    text: "Думаю над ответом",
    image: "Продумываю визуал",
    video: "Собираю сцены",
    file: "Читаю вложения",
    code: "Планирую код",
    website: "Собираю интерфейс",
    codex: "Планирую файлы",
  }

  return (
    <div className="malik-thinking-card">
      <div className="malik-thinking-orb">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="malik-thinking-title">
          <span>{labelMap[generationType] || labelMap.text}</span>
          <span className="malik-thinking-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="malik-thinking-line">
          <span />
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  currentUser,
  onCopy,
  copied,
  generationType = "text",
  onRegenerate,
  onShare,
  onFeedback,
  feedback,
}: {
  message: Message
  currentUser: string
  onCopy: (id: string, text: string) => void
  copied: boolean
  generationType?: GenerationStatusType
  onRegenerate?: (id: string) => void
  onShare?: (text: string) => void
  onFeedback?: (id: string, value: "up" | "down") => void
  feedback?: "up" | "down" | null
}) {
  const isUser = message.role === "user"
  const isThinking = Boolean(message.isStreaming && !message.content && !message.generatedMedia)
  return (
    <div data-malik-message={message.role} className={cn("malik-message-row flex w-full gap-3 sm:gap-4", isUser ? "malik-message-row-user justify-end" : "malik-message-row-assistant justify-start")}>
      {!isUser && (
        <div className="malik-ai-avatar flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black">
          <svg viewBox="0 0 44 44" className="h-full w-full" aria-hidden="true"><rect width="44" height="44" rx="12" fill="white" /><path d="M9 29 L22 15 L22 29 Z" fill="#03040a" /><path d="M24 15 H38 L24 29 Z" fill="#03040a" /></svg>
        </div>
      )}
      <div className={cn("malik-message-stack min-w-0 max-w-[min(900px,82%)] overflow-hidden", isUser && "order-first max-w-[min(720px,74%)]")}>
        <div className={cn("malik-message-meta mb-1 flex items-center gap-2 text-xs", isUser ? "justify-end text-slate-500" : "text-slate-500")}>
          <span>{isUser ? "Вы" : "Malik AI"}</span>
          <span>{new Date(message.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className={cn(
          "malik-message-card break-words rounded-2xl text-[14px] leading-7 sm:text-[15px]",
          message.generatedMedia || isThinking
            ? "bg-transparent p-0"
            : cn("whitespace-pre-wrap border px-4 py-3 sm:px-5 sm:py-4", isUser ? "malik-message-card-user border-white/10 bg-white/[0.07] text-white" : "malik-message-card-assistant border-blue-300/10 bg-[#071126]/78 text-gray-100 shadow-[0_18px_60px_rgba(0,0,0,.22)]")
        )}>
          {message.generatedMedia ? <GeminiMediaGenerationCard media={message.generatedMedia} /> : message.content || (message.isStreaming ? <ThinkingBubble generationType={generationType} /> : "")}
        </div>
        {!isUser && message.content && !message.isStreaming && (
          <div className="malik-message-actions mt-2 flex items-center gap-2 text-slate-500">
            <button type="button" title="Копировать" onClick={() => onCopy(message.id, message.content)} className="rounded-md p-1 hover:bg-white/10 hover:text-white">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
            <button type="button" title="Перегенерировать" onClick={() => onRegenerate?.(message.id)} className="rounded-md p-1 hover:bg-white/10 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
            <button type="button" title="Полезно" onClick={() => onFeedback?.(message.id, "up")} className={cn("rounded-md p-1 hover:bg-white/10 hover:text-white", feedback === "up" && "text-emerald-300")}><ThumbsUp className="h-4 w-4" /></button>
            <button type="button" title="Не полезно" onClick={() => onFeedback?.(message.id, "down")} className={cn("rounded-md p-1 hover:bg-white/10 hover:text-white", feedback === "down" && "text-amber-300")}><ThumbsDown className="h-4 w-4" /></button>
            <button type="button" title="Поделиться" onClick={() => onShare?.(message.content)} className="rounded-md p-1 hover:bg-white/10 hover:text-white"><Share className="h-4 w-4" /></button>
          </div>
        )}
        {!isUser && !message.generatedMedia && message.content && !message.isStreaming && (
          <div className="malik-answer-badges">
            <span><Sparkles className="h-3 w-3" /> Обработано</span>
            <span><ShieldCheck className="h-3 w-3" /> Безопасный режим</span>
          </div>
        )}
      </div>
      {isUser && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 text-xs font-black text-white">{getInitials(currentUser)}</div>}
    </div>
  )
}

export function ChatView({ messages, onSendMessage, isLoading, currentUser = "User", userPlan = "free", onOpenCodex, onForceCanvas }: ChatViewProps) {
  const [prompt, setPrompt] = useState("")
  const [effectivePlan, setEffectivePlan] = useState<AIPlan>(userPlan)
  const [responseDepth, setResponseDepth] = useState<ResponseDepth>(() => loadResponseDepth(userPlan))
  const showUltra = canUseUltra(effectivePlan)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down">>({})
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [codeModalOpen, setCodeModalOpen] = useState(false)
  const [codeText, setCodeText] = useState("")
  const [urlModalOpen, setUrlModalOpen] = useState(false)
  const [urlText, setUrlText] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])
  useEffect(() => {
    setEffectivePlan(userPlan)
    if (!currentUser || currentUser === "User") return
    fetch(`/api/ai/usage?userId=${encodeURIComponent(currentUser)}`)
      .then((response) => response.json())
      .then((data) => {
        const plan = data?.plan
        if (plan === "pro" || plan === "ultra" || plan === "owner") setEffectivePlan(plan)
      })
      .catch(() => {})
  }, [currentUser, userPlan])

  useEffect(() => {
    const loaded = loadResponseDepth(effectivePlan)
    setResponseDepth(loaded === "ultra" && !canUseUltra(effectivePlan) ? "deep" : loaded)
  }, [effectivePlan])
  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = "auto"
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
  }, [prompt])

  const activeGenerationType = useMemo(() => {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")
    const attachmentHint = attachments.map((item) => item.kind).join(" ")
    return detectGenerationStatusType(`${lastUserMessage?.content || prompt} ${attachmentHint}`)
  }, [attachments, messages, prompt])

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setLocalError(null)
    try {
      const parsed = await Promise.all(Array.from(files).slice(0, 6).map(fileToAttachment))
      setAttachments((previous) => [...previous, ...parsed].slice(0, 8))
      setShowAttachMenu(false)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Ошибка файла")
    }
  }

  const addCodeAttachment = () => {
    if (!codeText.trim()) return
    const attachment: ChatAttachment = { id: crypto.randomUUID(), name: "Вставленный код", mime: "text/plain", size: codeText.length, kind: "code", text: codeText }
    setAttachments((previous) => [...previous, attachment].slice(0, 8))
    setCodeText("")
    setCodeModalOpen(false)
    setShowAttachMenu(false)
  }

  const addUrlAttachment = () => {
    const clean = urlText.trim()
    if (!clean) return
    const attachment: ChatAttachment = { id: crypto.randomUUID(), name: clean, mime: "text/uri-list", size: clean.length, kind: "url", url: clean }
    setAttachments((previous) => [...previous, attachment].slice(0, 8))
    setUrlText("")
    setUrlModalOpen(false)
    setShowAttachMenu(false)
  }

  const handleGuardedSubmit = () => {
    const text = prompt.trim()
    if (!text && attachments.length === 0) return
    if (isLoading) {
      setLocalError("Malik AI уже обрабатывает запрос.")
      return
    }
    setLocalError(null)
    onSendMessage(text || "Проанализируй вложения", attachments, { responseDepth })
    setPrompt("")
    setAttachments([])
    setShowAttachMenu(false)
  }

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text || "")
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setLocalError("Clipboard blocked. Текст можно выделить и скопировать вручную.")
      window.setTimeout(() => setLocalError(null), 2200)
    }
  }

  const handleRegenerate = (messageId: string) => {
    const index = messages.findIndex((item) => item.id === messageId)
    if (index <= 0) return
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user" && messages[i].content.trim()) {
        onSendMessage(messages[i].content, [], { responseDepth })
        return
      }
    }
  }

  const handleShare = async (text: string) => {
    const payload = text.trim()
    if (!payload) return
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Malik AI", text: payload.slice(0, 500) })
        return
      }
      await navigator.clipboard?.writeText(payload)
      setLocalError("Ответ скопирован — можно вставить куда угодно.")
      window.setTimeout(() => setLocalError(null), 1800)
    } catch {
      setLocalError("Не удалось поделиться ответом.")
      window.setTimeout(() => setLocalError(null), 1800)
    }
  }

  const handleFeedback = (messageId: string, value: "up" | "down") => {
    setFeedbackMap((previous) => ({ ...previous, [messageId]: value }))
  }

  const modelLabel =
    responseDepth === "ultra" ? "Malik AI Ultra Pro" : responseDepth === "deep" ? "Malik AI Deep" : "Malik AI Fast"

  const selectDepth = (depth: ResponseDepth) => {
    if (depth === "ultra" && !showUltra) return
    setResponseDepth(depth)
    saveResponseDepth(depth)
  }

  const handleQuickAction = (prefix: string) => {
    setPrompt((previous) => previous ? `${prefix}: ${previous}` : prefix)
    setShowAttachMenu(false)
    textareaRef.current?.focus()
  }

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        setIsRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" })
        const attachment = await fileToAttachment(file)
        setAttachments((previous) => [...previous, attachment].slice(0, 8))
      }
      recorder.start()
      setIsRecording(true)
    } catch {
      setLocalError("Микрофон недоступен. Разрешите доступ в браузере.")
    }
  }

  const attachItems = useMemo(() => [
    { label: "Добавить фото и файлы", icon: Paperclip, action: () => fileInputRef.current?.click() },
    { label: "Добавить картинку", icon: ImageIcon, action: () => imageInputRef.current?.click() },
    { label: "Добавить видео", icon: Video, action: () => videoInputRef.current?.click() },
    { label: "Добавить аудио", icon: Volume2, action: () => audioInputRef.current?.click() },
    { label: isRecording ? "Остановить запись" : "Записать голос", icon: Mic, action: toggleRecording },
    { label: "Вставить код", icon: Code, action: () => setCodeModalOpen(true) },
    { label: "Из URL", icon: LinkIcon, action: () => setUrlModalOpen(true) },
    { label: "Создать изображение", icon: Wand2, action: () => handleQuickAction("Создай изображение по описанию") },
    { label: "Создать видео", icon: Video, action: () => handleQuickAction("Создай видео по описанию") },
    { label: "Глубокое исследование", icon: Search, action: () => handleQuickAction("Проведи глубокое исследование") },
    { label: "Поиск в сети", icon: Globe, action: () => handleQuickAction("Найди в сети свежую информацию") },
    { label: "Режим агента", icon: Bot, action: () => handleQuickAction("Включи режим агента и составь план выполнения") },
    { label: "Холст / Canvas", icon: Layers, action: () => { onForceCanvas?.(); handleQuickAction("Создай проект в canvas") } },
    { label: "GitHub", icon: Github, action: () => handleQuickAction("Подготовь GitHub-ready структуру") },
    { label: "Архитектура кода", icon: FolderTree, action: () => handleQuickAction("Спроектируй архитектуру кода и файлы") },
    { label: "Malik Codex", icon: FilePlus2, action: () => { setShowAttachMenu(false); onOpenCodex?.() } },
  ], [onOpenCodex, onForceCanvas, isRecording])

  return (
    <div data-malik-chat-fullwidth="1" className="malik-chat-fullwidth relative z-[2] flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-[#02050d]/35 text-white">
      <style>{`
        @media (min-width: 1024px) {
          .malik-dashboard-shell main > section {
            flex: 1 1 100% !important;
            width: 100% !important;
            max-width: 100% !important;
            border-right: 0 !important;
          }
          .malik-dashboard-shell main > aside {
            display: none !important;
          }
        }
      `}</style>
      <div className="malik-chat-space pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(34,211,238,.06),transparent_26%),radial-gradient(circle_at_72%_10%,rgba(124,58,237,.08),transparent_28%),linear-gradient(180deg,#02050d,#030303)]" />
      <div className="malik-chat-grid pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,rgba(147,197,253,.32)_1px,transparent_1px),linear-gradient(to_bottom,rgba(147,197,253,.32)_1px,transparent_1px)] [background-size:44px_44px]" />
      <span className="malik-chat-horizon pointer-events-none absolute inset-x-0 bottom-[134px] h-48" />

      <div data-message-list className="malik-chat-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-44 pt-6 md:px-8 md:pb-48 lg:px-10">
        <div className="malik-message-list mx-auto flex w-full max-w-[1180px] flex-col gap-7 sm:gap-8">
          {messages.length === 0 ? (
            <div className="relative mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 text-center shadow-[0_30px_90px_rgba(0,0,0,.38)] backdrop-blur-xl sm:mt-16 sm:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(34,211,238,.15),transparent_35%),radial-gradient(circle_at_78%_75%,rgba(139,92,246,.16),transparent_36%)]" />
              <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_0_60px_rgba(255,255,255,.16)]">
                <svg viewBox="0 0 44 44" className="h-full w-full" aria-hidden="true"><rect width="44" height="44" rx="12" fill="white" /><path d="M9 29 L22 15 L22 29 Z" fill="#03040a" /><path d="M24 15 H38 L24 29 Z" fill="#03040a" /></svg>
              </div>
              <h2 className="relative text-3xl font-black tracking-tight">Malik AI Max</h2>
              <p className="relative mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Чат, код, canvas, файлы, голос, Codex және фото/видео generation — бәрі бір prompt ішінде.</p>
            </div>
          ) : (
            <>
              <div className="malik-date-chip">Сегодня</div>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  currentUser={currentUser}
                  onCopy={handleCopy}
                  copied={copiedId === message.id}
                  generationType={activeGenerationType}
                  onRegenerate={handleRegenerate}
                  onShare={handleShare}
                  onFeedback={handleFeedback}
                  feedback={feedbackMap[message.id] ?? null}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div data-composer className="malik-composer-dock relative z-20 w-full shrink-0 border-t border-white/8 bg-[#02050d]/72 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-2xl md:px-8 md:pb-6 lg:px-10">
        <div className="malik-composer-panel chat-composer mx-auto w-full max-w-[1180px] rounded-[1.55rem] border border-blue-300/16 bg-[#060914]/96 p-3 shadow-[0_-18px_80px_rgba(37,99,235,.12)] backdrop-blur-xl sm:p-4">
          {localError && <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">{localError}</div>}
          {attachments.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{attachments.map((attachment) => <AttachmentPill key={attachment.id} item={attachment} onRemove={() => setAttachments((previous) => previous.filter((item) => item.id !== attachment.id))} />)}</div>}
          <div className="malik-composer-top relative mb-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setModelMenuOpen((value) => !value)}
              className="malik-model-chip flex min-w-0 items-center gap-2 text-sm font-bold"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white"><svg viewBox="0 0 44 44" className="h-5 w-5" aria-hidden="true"><rect width="44" height="44" rx="12" fill="white" /><path d="M9 29 L22 15 L22 29 Z" fill="#03040a" /><path d="M24 15 H38 L24 29 Z" fill="#03040a" /></svg></span>
              <span className="truncate">{modelLabel}</span>
              <ChevronRight className={cn("h-4 w-4 rotate-90 text-slate-500 transition", modelMenuOpen && "rotate-[-90deg]")} />
            </button>
            {modelMenuOpen ? (
              <div className="absolute left-0 top-full z-30 mt-2 w-56 rounded-xl border border-white/10 bg-[#060914] p-1.5 shadow-2xl">
                <button type="button" onClick={() => { selectDepth("fast"); setModelMenuOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">
                  <Zap className="h-4 w-4 text-cyan-300" /> Malik AI Fast
                </button>
                <button type="button" onClick={() => { selectDepth("deep"); setModelMenuOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">
                  <Brain className="h-4 w-4 text-violet-300" /> Malik AI Deep
                </button>
                {showUltra ? (
                  <button type="button" onClick={() => { selectDepth("ultra"); setModelMenuOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">
                    <Crown className="h-4 w-4 text-amber-300" /> Malik AI Ultra Pro
                  </button>
                ) : null}
              </div>
            ) : null}
            <button type="button" onClick={() => textareaRef.current?.focus()} className="malik-composer-expand" aria-label="Развернуть поле ввода">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          <div className="malik-depth-toggle mb-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => selectDepth("fast")}
              className={cn(
                "malik-depth-toggle__btn inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
                responseDepth === "fast"
                  ? "malik-depth-toggle__btn--active border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200",
              )}
            >
              <Zap className="h-3 w-3" />
              Быстрый
            </button>
            <button
              type="button"
              onClick={() => selectDepth("deep")}
              className={cn(
                "malik-depth-toggle__btn inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
                responseDepth === "deep"
                  ? "malik-depth-toggle__btn--active border-violet-400/50 bg-violet-500/15 text-violet-200"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200",
              )}
            >
              <Brain className="h-3 w-3" />
              Глубокий
            </button>
            {showUltra ? (
              <button
                type="button"
                onClick={() => selectDepth("ultra")}
                className={cn(
                  "malik-depth-toggle__btn malik-depth-toggle__btn--ultra inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
                  responseDepth === "ultra"
                    ? "malik-depth-toggle__btn--ultra-active border-amber-300/70 bg-gradient-to-r from-amber-500/30 via-yellow-400/25 to-amber-600/30 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,.35)]"
                    : "border-amber-500/35 bg-amber-500/[0.06] text-amber-200/80 hover:border-amber-400/55 hover:text-amber-100",
                )}
              >
                <Crown className="h-3 w-3" />
                Ultra Pro
              </button>
            ) : null}
          </div>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                handleGuardedSubmit()
              }
            }}
            placeholder="Опишите вашу идею для Malik AI..."
            className="malik-composer-textarea min-h-[50px] w-full resize-none bg-transparent text-[15px] text-white outline-none placeholder:text-slate-600 sm:min-h-[64px] sm:text-lg"
          />
          <div className="malik-composer-actions mt-2 flex items-center justify-between gap-2">
            <div className="malik-composer-tools flex items-center gap-1.5">
              <button type="button" onClick={() => setShowAttachMenu((value) => !value)} className="malik-composer-tool" aria-label="Прикрепить файл">
                <Paperclip className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => handleQuickAction("Собери структуру проекта")} className="malik-composer-tool" aria-label="Структура проекта">
                <Layers className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => handleQuickAction("Найди в сети свежую информацию")} className="malik-composer-tool" aria-label="Поиск в сети">
                <Globe className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => handleQuickAction("Усиль запрос и сделай профессионально")} className="malik-composer-tool malik-composer-tool-active" aria-label="Улучшить запрос">
                <Sparkles className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => handleQuickAction("Напиши код и объясни решение")} className="malik-composer-tool" aria-label="Код">
                <Code className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setShowAttachMenu((value) => !value)} className="malik-composer-tool" aria-label="Еще">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
            <div className="malik-composer-right-actions">
              <button type="button" onClick={() => handleQuickAction("Усиль запрос и сделай профессионально")} className="malik-enhance-button">
                <Wand2 className="h-4 w-4" />
                <span>Улучшить промпт</span>
              </button>
              <button type="button" onClick={handleGuardedSubmit} disabled={isLoading || (!prompt.trim() && attachments.length === 0)} className="malik-send-button flex min-w-[118px] items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-black transition hover:scale-[1.02] disabled:opacity-40 sm:min-w-[132px] sm:px-7">
                {isLoading ? "Думаю..." : "Отправить"}
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
          {showAttachMenu && (
            <div className="fixed inset-x-3 bottom-[152px] z-40 max-h-[58dvh] overflow-y-auto rounded-2xl border border-[#1F2937] bg-[#101010] p-2 shadow-2xl md:absolute md:bottom-[170px] md:left-6 md:w-[330px] md:max-w-[330px]">
              <div className="grid grid-cols-1 gap-1">
                {attachItems.map((item) => (
                  <button key={item.label} type="button" onClick={item.action} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-200 hover:bg-white/10">
                    <span className="flex min-w-0 items-center gap-3"><item.icon className="h-4 w-4 shrink-0 text-violet-300" /><span className="truncate">{item.label}</span></span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="mt-2 hidden text-center text-xs text-slate-600 sm:block">Malik AI может ошибаться. Проверяйте важную информацию.</p>
      </div>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
      <input ref={audioInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />
      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(event) => handleFiles(event.target.files)} />

      {codeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[#1F2937] bg-[#0a0a0a] p-5">
            <h3 className="mb-3 font-black">Вставить код</h3>
            <textarea value={codeText} onChange={(event) => setCodeText(event.target.value)} className="h-72 w-full rounded-xl border border-[#1F2937] bg-black p-4 font-mono text-sm outline-none" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCodeModalOpen(false)} className="rounded-xl border border-[#1F2937] px-4 py-2">Отмена</button>
              <button type="button" onClick={addCodeAttachment} className="rounded-xl bg-white px-4 py-2 font-bold text-black">Добавить</button>
            </div>
          </div>
        </div>
      )}

      {urlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#1F2937] bg-[#0a0a0a] p-5">
            <h3 className="mb-3 font-black">Добавить URL</h3>
            <input value={urlText} onChange={(event) => setUrlText(event.target.value)} placeholder="https://..." className="w-full rounded-xl border border-[#1F2937] bg-black p-4 outline-none" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setUrlModalOpen(false)} className="rounded-xl border border-[#1F2937] px-4 py-2">Отмена</button>
              <button type="button" onClick={addUrlAttachment} className="rounded-xl bg-white px-4 py-2 font-bold text-black">Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatView

