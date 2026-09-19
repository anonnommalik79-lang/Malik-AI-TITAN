"use client"

import { memo, useEffect, useRef, useState } from "react"
import {
  ArrowUp,
  BookOpen,
  Brain,
  Film,
  Github,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  Paperclip,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react"
import { prefetchChatShell } from "@/lib/studio-prefetch"
import { PREFILL_EVENT, takePrefillPrompt, useContextEnabled } from "@/lib/malik-context"
import { DEFAULT_MALIK_MODEL_ID, type MalikModelId } from "@/lib/ai/malik-models"
import type { ChatSendOptions } from "@/lib/ai/response-depth"
import { useWebSearchEnabled } from "@/lib/ai/web-search-preference"
import type { AIPlan } from "@/lib/ai/types"
import type { MalikTemplate } from "@/lib/malik-template-registry"
import { MalikModelSelector } from "../MalikModelSelector"
import type { ChatAttachment } from "../chat-view"
import type { AiModeId } from "../power-registry"
import { VoiceWaveIcon } from "@/components/voice/VoiceWaveIcon"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

const MAX_HOME_ATTACHMENTS = 8
const MAX_HOME_VIDEO_SECONDS = 30
const MAX_HOME_BINARY_BYTES = 10 * 1024 * 1024
const MAX_HOME_TEXT_BYTES = 12 * 1024 * 1024
const MAX_HOME_TEXT_CHARS = 600_000

const HOME_TEXT_EXTENSIONS = new Set([
  "txt", "md", "mdx", "csv", "tsv", "json", "jsonl", "yaml", "yml", "xml", "html", "htm", "css",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "kt", "go", "rs", "rb", "php", "swift",
  "c", "h", "cpp", "hpp", "cs", "sql", "sh", "bash", "zsh", "ps1", "toml", "ini", "env", "log",
])
const HOME_CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "kt", "go", "rs", "rb", "php", "swift",
  "c", "h", "cpp", "hpp", "cs", "sql", "sh", "bash", "zsh", "ps1", "html", "css",
])
const HOME_FILE_ACCEPT = [
  ".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".mdx", ".csv", ".tsv", ".json", ".jsonl",
  ".yaml", ".yml", ".xml", ".html", ".htm", ".css", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".java", ".kt", ".go", ".rs", ".rb", ".php", ".swift", ".c", ".h", ".cpp", ".hpp", ".cs",
  ".sql", ".sh", ".bash", ".zsh", ".ps1", ".toml", ".ini", ".log",
].join(",")

const SOURCE_PLUGINS: Array<{
  id: string
  label: string
  icon: LucideIcon
  prompt: string
}> = [
  {
    id: "web",
    label: "Веб",
    icon: Globe,
    prompt: "Найди в открытом вебе актуальную информацию по теме: ",
  },
  {
    id: "github",
    label: "GitHub",
    icon: Github,
    prompt: "Найди через веб-поиск лучшие открытые репозитории и исходный код по теме (site:github.com): ",
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    icon: BookOpen,
    prompt: "Найди проверенную справочную информацию по теме в Wikipedia (site:wikipedia.org): ",
  },
  {
    id: "arxiv",
    label: "arXiv",
    icon: GraduationCap,
    prompt: "Найди научные статьи и исследования по теме на arXiv (site:arxiv.org): ",
  },
]

const MOBILE_EXACT_ACTIONS = [
  { id: "create", label: "Создать", prompt: "Создай изображение уровня мирового продукта" },
  { id: "research", label: "Исследовать", prompt: "Проведи глубокое исследование", web: true },
  { id: "help", label: "Помощь", prompt: "Помоги мне решить задачу" },
  { id: "more", label: "Больше", prompt: "Покажи больше возможностей Malik AI" },
] as const

function attachmentId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `malik-attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || "")
      resolve(dataUrl.includes(",") ? dataUrl.split(",").pop() || "" : dataUrl)
    }
    reader.onerror = () => reject(new Error(`Не удалось прочитать ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function videoDurationSeconds(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video")
    const objectUrl = URL.createObjectURL(file)
    let settled = false

    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeAttribute("src")
      video.load()
      URL.revokeObjectURL(objectUrl)
    }

    const finish = (duration?: number, error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(duration || 0)
    }

    const timer = window.setTimeout(() => {
      finish(undefined, new Error(`Не удалось проверить длительность ${file.name}.`))
    }, 10_000)

    video.preload = "metadata"
    video.onloadedmetadata = () => {
      const duration = Number(video.duration)
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(undefined, new Error(`Не удалось проверить длительность ${file.name}.`))
        return
      }
      finish(duration)
    }
    video.onerror = () => finish(undefined, new Error(`Не удалось открыть видео ${file.name}.`))
    video.src = objectUrl
  })
}

function homeUploadExtension(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ""
}

function homeUploadMime(file: File) {
  if (file.type) return file.type
  const ext = homeUploadExtension(file.name)
  if (ext === "pdf") return "application/pdf"
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  if (ext === "json") return "application/json"
  if (ext === "csv") return "text/csv"
  if (HOME_TEXT_EXTENSIONS.has(ext)) return "text/plain"
  return "application/octet-stream"
}

async function homeFileToAttachment(file: File): Promise<ChatAttachment> {
  const mime = homeUploadMime(file)
  const ext = homeUploadExtension(file.name)
  const isImage = mime.startsWith("image/")
  const isVideo = mime.startsWith("video/")
  const isText = mime.startsWith("text/") || mime === "application/json" || HOME_TEXT_EXTENSIONS.has(ext)

  if (isText) {
    if (file.size > MAX_HOME_TEXT_BYTES) {
      throw new Error(`${file.name}: слишком большой текстовый файл. Максимум 12 MB.`)
    }
    return {
      id: attachmentId(),
      name: file.name || "document.txt",
      mime,
      size: file.size,
      kind: HOME_CODE_EXTENSIONS.has(ext) ? "code" : "file",
      text: (await file.text()).slice(0, MAX_HOME_TEXT_CHARS),
    }
  }

  if (file.size > MAX_HOME_BINARY_BYTES) {
    throw new Error(`${file.name}: слишком большой файл для чата. Максимум 10 MB.`)
  }

  if (isVideo) {
    const duration = await videoDurationSeconds(file)
    if (duration > MAX_HOME_VIDEO_SECONDS + 0.05) {
      throw new Error(`${file.name}: видео ${Math.ceil(duration)} сек. Максимум 30 сек.`)
    }
  }

  const supportedBinary =
    isImage ||
    isVideo ||
    mime.startsWith("audio/") ||
    mime === "application/pdf" ||
    mime.includes("officedocument")
  if (!supportedBinary) {
    throw new Error(`${file.name}: этот формат пока не поддерживается для анализа.`)
  }

  const base64 = await readAsBase64(file)
  return {
    id: attachmentId(),
    name: file.name || (isVideo ? "video.mp4" : isImage ? "image.jpg" : "document"),
    mime,
    size: file.size,
    kind: isImage ? "image" : isVideo ? "video" : mime.startsWith("audio/") ? "audio" : "file",
    base64,
    url: isImage || isVideo ? URL.createObjectURL(file) : undefined,
  }
}

export interface MalikHybridHomeProps {
  onSubmit: (prompt: string, attachments?: ChatAttachment[], options?: ChatSendOptions) => void
  isLoading?: boolean
  onOpenCodex?: () => void
  onOpenTemplates?: () => void
  onOpenPhoto?: () => void
  onOpenVideo?: () => void
  onOpenWebsite?: () => void
  onOpenCode?: () => void
  onOpenBilling?: () => void
  onOpenCanvas?: () => void
  onOpenCommandCenter?: () => void
  onOpenSupport?: () => void
  onOpenCapabilities?: () => void
  onOpenVoice?: () => void
  onLaunchTemplate?: (template: MalikTemplate) => void
  selectedModelId?: MalikModelId
  userPlan?: AIPlan
  onModelChange?: (modelId: MalikModelId) => void
  currentMode?: AiModeId
  onModeChange?: (mode: AiModeId) => void
}

function HomeComposer({
  prompt,
  isLoading,
  webOn,
  memoryOn,
  attachments,
  attachmentError,
  onPromptChange,
  onSubmit,
  onToggleWeb,
  onToggleMemory,
  onSelectMediaFiles,
  onRemoveAttachment,
  selectedModelId,
  userPlan,
  onModelChange,
  onOpenBilling,
  onOpenVoice,
  imageCredits,
}: {
  prompt: string
  isLoading?: boolean
  webOn: boolean
  memoryOn: boolean
  attachments: ChatAttachment[]
  attachmentError: string
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onToggleWeb: () => void
  onToggleMemory: () => void
  onSelectMediaFiles: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  selectedModelId: MalikModelId
  userPlan: AIPlan
  onModelChange: (modelId: MalikModelId) => void
  onOpenBilling?: () => void
  onOpenVoice?: () => void
  imageCredits?: { remaining: number; daily: number } | null
}) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const field = textareaRef.current
    if (!field) return
    const mobile = window.matchMedia("(max-width: 767px)").matches
    const priority = mobile ? "important" : ""
    field.style.setProperty("height", "0px", priority)
    field.style.setProperty("height", `${Math.min(Math.max(field.scrollHeight, mobile ? 44 : 54), 220)}px`, priority)
  }, [prompt])

  useEffect(() => {
    if (!toolsOpen) return
    const close = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [toolsOpen])

  const openAndClose = (action?: () => void) => {
    action?.()
    setToolsOpen(false)
  }

  const tools: Array<{
    id: string
    label: string
    icon: LucideIcon
    action: () => void
  }> = [
    { id: "upload-image", label: "Загрузить изображения", icon: ImageIcon, action: () => imageInputRef.current?.click() },
    { id: "upload-video", label: "Загрузить видео", icon: Film, action: () => videoInputRef.current?.click() },
    { id: "upload-files", label: "Загрузить файлы", icon: Paperclip, action: () => fileInputRef.current?.click() },
  ]

  const importRemoteAsFile = async (rawUrl: string) => {
    const url = rawUrl.trim()
    if (!/^https?:\/\//i.test(url)) return false
    try {
      const response = await fetch("/api/attachments/import-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ url }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.ok || !payload?.file?.base64) return false
      const binary = atob(String(payload.file.base64))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const file = new File([bytes], String(payload.file.name || "shared-media"), {
        type: String(payload.file.mime || "application/octet-stream"),
      })
      onSelectMediaFiles([file])
      return true
    } catch {
      return false
    }
  }

  const transferUrl = (transfer: DataTransfer | null) => {
    if (!transfer) return ""
    const uri = transfer.getData("text/uri-list").split(/\r?\n/).find((line) => line && !line.startsWith("#")) || ""
    if (/^https?:\/\//i.test(uri.trim())) return uri.trim()
    const html = transfer.getData("text/html")
    const src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || ""
    if (/^https?:\/\//i.test(src)) return src
    const text = transfer.getData("text/plain").trim()
    return /^https?:\/\/\S+$/i.test(text) ? text : ""
  }

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files || [])
    if (files.length) {
      event.preventDefault()
      onSelectMediaFiles(files)
      return
    }
    const url = transferUrl(event.clipboardData)
    if (url) {
      event.preventDefault()
      await importRemoteAsFile(url)
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const files = Array.from(event.dataTransfer.files || [])
    if (files.length) {
      onSelectMediaFiles(files)
      return
    }
    const url = transferUrl(event.dataTransfer)
    if (url) await importRemoteAsFile(url)
  }

  const hasSendableContent = Boolean(prompt.trim() || attachments.length)

  return (
    <section
      className={cn("thome-composer", dragActive && "is-dragging")}
      aria-label="Новый запрос"
      data-has-content={hasSendableContent ? "true" : "false"}
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
      onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
      }}
      onDrop={handleDrop}
    >
      <div className="thome-composer-row">
        <div className="thome-tools" ref={toolsRef}>
          <button
            type="button"
            onClick={() => setToolsOpen((open) => !open)}
            className={cn("thome-icon-button thome-plus-button", toolsOpen && "is-open")}
            aria-label="Загрузить в Malik AI"
            aria-expanded={toolsOpen}
            aria-haspopup="menu"
          >
            <Plus aria-hidden="true" />
          </button>

          {toolsOpen ? (
            <div className="thome-tools-menu" role="menu" aria-label="Загрузить в Malik AI">
              {tools.map((tool) => {
                const Icon = tool.icon
                return (
                  <button
                    key={tool.id}
                    type="button"
                    role="menuitem"
                    className="thome-tools-item"
                    onClick={() => openAndClose(tool.action)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{tool.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              onSelectMediaFiles(Array.from(event.currentTarget.files || []))
              event.currentTarget.value = ""
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              onSelectMediaFiles(Array.from(event.currentTarget.files || []))
              event.currentTarget.value = ""
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={HOME_FILE_ACCEPT}
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              onSelectMediaFiles(Array.from(event.currentTarget.files || []))
              event.currentTarget.value = ""
            }}
          />
        </div>

        <textarea
          ref={textareaRef}
          value={prompt}
          onFocus={prefetchChatShell}
          onChange={(event) => {
            if (event.target.value.trim()) prefetchChatShell()
            onPromptChange(event.target.value)
          }}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          rows={1}
          aria-label="Спросите Malik AI"
          placeholder="Чем я могу помочь сегодня?"
        />

        <div className="thome-composer-right">
          <MalikModelSelector
            selectedModelId={selectedModelId}
            plan={userPlan}
            onSelect={onModelChange}
            onOpenBilling={onOpenBilling}
            placement="top"
          />

          <span className="thome-action-swap">
            <button
              type="button"
              onClick={onOpenVoice}
              disabled={isLoading}
              className={cn("thome-voice-entry", hasSendableContent && "is-hidden")}
              aria-label="Открыть голосовой режим"
              aria-hidden={hasSendableContent}
              tabIndex={hasSendableContent ? -1 : 0}
            >
              <VoiceWaveIcon />
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!hasSendableContent || isLoading}
              className={cn("thome-submit", !hasSendableContent && "is-hidden")}
              aria-label={isLoading ? "Malik AI отвечает" : "Отправить запрос"}
              aria-hidden={!hasSendableContent}
              tabIndex={hasSendableContent ? 0 : -1}
            >
              {isLoading ? <span className="thome-submit-loader" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
            </button>
          </span>
        </div>
      </div>

      {attachments.length || attachmentError ? (
        <div className="thome-attachments" aria-live="polite">
          {attachments.map((item) => {
            const preview = typeof item.url === "string" && /^(?:blob:|data:|https?:)/i.test(item.url) ? item.url : ""
            if ((item.kind === "image" || item.kind === "video") && preview) {
              return (
                <span key={item.id} className="thome-attachment-preview" title={item.name}>
                  {item.kind === "image"
                    ? <img src={preview} alt={item.name || "Изображение"} />
                    : <video src={preview} muted playsInline preload="metadata" />}
                  <button type="button" onClick={() => onRemoveAttachment(item.id)} aria-label={`Убрать ${item.name}`}>
                    <X aria-hidden="true" />
                  </button>
                </span>
              )
            }
            const Icon = item.kind === "video" ? Film : item.kind === "image" ? ImageIcon : Paperclip
            return (
              <span key={item.id} className="thome-attachment-pill">
                <Icon aria-hidden="true" />
                <span>{item.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(item.id)} aria-label={`Убрать ${item.name}`}>
                  <X aria-hidden="true" />
                </button>
              </span>
            )
          })}
          {attachmentError ? <span className="thome-attachment-error">{attachmentError}</span> : null}
        </div>
      ) : null}

      <div className="thome-composer-meta" aria-label="Активные возможности">
        <button type="button" onClick={onToggleWeb} className={cn("thome-meta-chip", webOn && "is-active")}>
          <Globe aria-hidden="true" />
          {webOn ? "Веб-поиск: авто" : "Веб-поиск выключен"}
        </button>
        <button type="button" onClick={onToggleMemory} className={cn("thome-meta-chip", memoryOn && "is-active")}>
          <Brain aria-hidden="true" />
          Память {memoryOn ? "включена" : "выключена"}
        </button>
        <span className="thome-meta-chip" title="Ежедневные кредиты генерации изображений">
          <ImageIcon aria-hidden="true" />
          Фото {imageCredits ? (imageCredits.remaining > 1_000_000 ? "∞" : imageCredits.remaining) : "…"} кр.
        </span>
        <span className="thome-meta-note">Покажу прочитанные источники</span>
      </div>
    </section>
  )
}

function MalikHybridHomeInner(props: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState("")
  const [imageCredits, setImageCredits] = useState<{ remaining: number; daily: number } | null>(null)
  const [webOn, setWebOn] = useWebSearchEnabled()
  const [memoryOn, setMemoryOn] = useContextEnabled()

  useEffect(() => {
    let cancelled = false
    const refreshCredits = async () => {
      try {
        const response = await fetch("/api/ai/image/credits", { cache: "no-store", credentials: "same-origin" })
        const payload = await response.json().catch(() => null)
        if (!cancelled && response.ok && payload?.ok) {
          setImageCredits({
            remaining: Number(payload.remaining || 0),
            daily: Number(payload.daily || 0),
          })
        }
      } catch {
        // The home remains usable while the server balance refreshes.
      }
    }
    const refresh = () => { void refreshCredits() }
    refresh()
    window.addEventListener("malik-image-credits-changed", refresh)
    return () => {
      cancelled = true
      window.removeEventListener("malik-image-credits-changed", refresh)
    }
  }, [])

  useEffect(() => {
    const fill = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      if (typeof text !== "string") return
      setPrompt(text)
      window.setTimeout(() => {
        const field = Array.from(document.querySelectorAll<HTMLTextAreaElement>(".thome-composer textarea"))
          .find((candidate) => candidate.getClientRects().length > 0)
        field?.focus()
        field?.setSelectionRange(text.length, text.length)
      }, 0)
    }

    const pending = takePrefillPrompt()
    if (pending) fill(new CustomEvent(PREFILL_EVENT, { detail: pending }))

    window.addEventListener(PREFILL_EVENT, fill)
    return () => window.removeEventListener(PREFILL_EVENT, fill)
  }, [])

  const addFiles = async (files: File[]) => {
    if (!files.length) return
    setAttachmentError("")

    const room = Math.max(0, MAX_HOME_ATTACHMENTS - attachments.length)
    if (!room) {
      setAttachmentError(`Можно прикрепить максимум ${MAX_HOME_ATTACHMENTS} файлов.`)
      return
    }

    const accepted: ChatAttachment[] = []
    const errors: string[] = []
    for (const file of files.slice(0, room)) {
      try {
        accepted.push(await homeFileToAttachment(file))
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Не удалось добавить ${file.name}.`)
      }
    }

    if (files.length > room) errors.push(`Можно прикрепить максимум ${MAX_HOME_ATTACHMENTS} файлов.`)
    if (accepted.length) setAttachments((previous) => [...previous, ...accepted].slice(0, MAX_HOME_ATTACHMENTS))
    if (errors.length) setAttachmentError(errors[0])
  }


  useEffect(() => {
    const current = new URL(window.location.href)
    const token = current.searchParams.get("shareTarget")
    if (!token) return
    let cancelled = false

    fetch(`/api/attachments/share-target?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
      .then(async ({ response, payload }) => {
        if (cancelled || !response.ok || !payload?.ok) return
        const sharedFiles: File[] = []
        for (const item of Array.isArray(payload.files) ? payload.files : []) {
          try {
            const base64 = String(item?.base64 || "")
            if (!base64) continue
            const binary = atob(base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
            sharedFiles.push(new File([bytes], String(item?.name || "shared-media"), {
              type: String(item?.mime || "application/octet-stream"),
            }))
          } catch {}
        }
        if (sharedFiles.length) await addFiles(sharedFiles)
        const sharedText = [payload.text, payload.url].map((value) => String(value || "").trim()).filter(Boolean).join("\n")
        if (sharedText) setPrompt((previous) => previous.trim() ? previous : sharedText)
      })
      .finally(() => {
        if (cancelled) return
        current.searchParams.delete("shareTarget")
        window.history.replaceState(window.history.state, "", current.pathname + current.search + current.hash)
      })

    return () => { cancelled = true }
  }, [])

  const removeAttachment = (id: string) => {
    setAttachments((previous) => {
      const target = previous.find((item) => item.id === id)
      if (target?.url?.startsWith("blob:")) URL.revokeObjectURL(target.url)
      return previous.filter((item) => item.id !== id)
    })
    setAttachmentError("")
  }

  const submit = () => {
    const text = prompt.trim()
    if ((!text && !attachments.length) || props.isLoading) return

    const attachmentPrompt = attachments.some((item) => item.kind === "video")
      ? "Проанализируй прикреплённое видео и подробно ответь по его содержанию."
      : attachments.some((item) => item.kind === "image")
        ? "Проанализируй прикреплённое изображение и подробно ответь по его содержанию."
        : "Прочитай прикреплённые файлы и подробно ответь по их содержанию."

    props.onSubmit(text || attachmentPrompt, attachments, { research: webOn })
    setPrompt("")
    setAttachments([])
    setAttachmentError("")
  }

  const focusPrompt = (value: string) => {
    setPrompt(value)
    window.setTimeout(() => {
      const field = Array.from(document.querySelectorAll<HTMLTextAreaElement>(".thome-composer textarea"))
        .find((candidate) => candidate.getClientRects().length > 0)
      field?.focus()
      field?.setSelectionRange(value.length, value.length)
    }, 0)
  }

  const openSourcePlugin = (pluginPrompt: string) => {
    setWebOn(true)
    prefetchChatShell()
    focusPrompt(pluginPrompt)
  }

  return (
    <div className="thome">
      <div className="thome-inner">
        <section className="thome-launcher" aria-label="Malik AI">
          <div className="thome-welcome">
            <span className="thome-welcome-logo" aria-hidden="true">
              <svg viewBox="0 0 44 44">
                <path d="M9 29 L22 15 L22 29 Z" fill="currentColor" />
                <path d="M24 15 H38 L24 29 Z" fill="currentColor" />
              </svg>
            </span>
            <h1 aria-label="Добро пожаловать в Malik AI">
              <span className="thome-word is-1">Добро</span>{" "}
              <span className="thome-word is-2">пожаловать</span>{" "}
              <span className="thome-word is-3">в</span>{" "}
              <strong>
                <span className="thome-word is-4">Malik</span>{" "}
                <span className="thome-word is-5">AI</span>
              </strong>
            </h1>
            <p className="thome-welcome-subtitle">
              От простого вопроса до глубокого исследования — Malik AI ищет по открытому вебу, читает страницы и показывает источники.
            </p>

            <HomeComposer
              prompt={prompt}
              isLoading={props.isLoading}
              webOn={webOn}
              memoryOn={memoryOn}
              attachments={attachments}
              attachmentError={attachmentError}
              onPromptChange={setPrompt}
              onSubmit={submit}
              onToggleWeb={() => setWebOn(!webOn)}
              onToggleMemory={() => setMemoryOn(!memoryOn)}
              onSelectMediaFiles={(files) => { void addFiles(files) }}
              onRemoveAttachment={removeAttachment}
              selectedModelId={props.selectedModelId || DEFAULT_MALIK_MODEL_ID}
              userPlan={props.userPlan || "free"}
              onModelChange={props.onModelChange || (() => {})}
              onOpenBilling={props.onOpenBilling}
              onOpenVoice={props.onOpenVoice}
              imageCredits={imageCredits}
            />

            <div
              className="mx-auto mt-5 grid w-full max-w-[920px] grid-cols-2 gap-2 sm:grid-cols-4"
              aria-label="Бесплатные плагины источников"
            >
              {SOURCE_PLUGINS.map((plugin) => {
                const Icon = plugin.icon
                return (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() => openSourcePlugin(plugin.prompt)}
                    className="group inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.018] px-3 text-[13px] font-medium text-zinc-400 transition duration-150 hover:border-white/[0.13] hover:bg-white/[0.045] hover:text-zinc-100 active:scale-[0.985]"
                  >
                    <Icon className="h-4 w-4 shrink-0 stroke-[1.7] text-zinc-500 transition-colors group-hover:text-zinc-300" aria-hidden="true" />
                    <span>{plugin.label}</span>
                  </button>
                )
              })}
            </div>

            <div
              className="thome-mobile-exact-layer"
              aria-label="Интерактивный мобильный главный экран Malik AI"
              data-testid="mobile-exact-interactive-layer"
            >
              <div className="thome-mobile-story-actions" aria-label="Возможности Malik AI">
                <button type="button" aria-label="Исследовать всё" onClick={() => { setWebOn(true); focusPrompt("Исследуй тему подробно и покажи актуальные источники: ") }} />
                <button type="button" aria-label="Создавать без ограничений" onClick={() => focusPrompt("Помоги создать новый проект без ограничений: ")} />
                <button type="button" aria-label="Знания в реальном времени" onClick={() => { setWebOn(true); focusPrompt("Найди актуальную информацию в реальном времени по теме: ") }} />
                <button type="button" aria-label="Превратить идею в результат" onClick={() => focusPrompt("Преврати мою идею в готовый результат: ")} />
                <button type="button" aria-label="Решить сложную задачу" onClick={() => focusPrompt("Реши сложную задачу пошагово: ")} />
                <button type="button" aria-label="Создать более красивый мир" onClick={() => props.onOpenPhoto?.()} />
              </div>

              <nav className="thome-mobile-quick-actions" aria-label="Быстрые действия Malik AI">
                {MOBILE_EXACT_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    aria-label={action.label}
                    data-testid={`mobile-quick-${action.id}`}
                    onClick={() => {
                      if ("web" in action && action.web) setWebOn(true)
                      focusPrompt(action.prompt)
                    }}
                  />
                ))}
              </nav>

              <div className="thome-mobile-exact-composer">
                <HomeComposer
                  prompt={prompt}
                  isLoading={props.isLoading}
                  webOn={webOn}
                  memoryOn={memoryOn}
                  attachments={attachments}
                  attachmentError={attachmentError}
                  onPromptChange={setPrompt}
                  onSubmit={submit}
                  onToggleWeb={() => setWebOn(!webOn)}
                  onToggleMemory={() => setMemoryOn(!memoryOn)}
                  onSelectMediaFiles={(files) => { void addFiles(files) }}
                  onRemoveAttachment={removeAttachment}
                  selectedModelId={props.selectedModelId || DEFAULT_MALIK_MODEL_ID}
                  userPlan={props.userPlan || "free"}
                  onModelChange={props.onModelChange || (() => {})}
                  onOpenBilling={props.onOpenBilling}
                  onOpenVoice={props.onOpenVoice}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export const MalikHybridHome = memo(MalikHybridHomeInner)
export default MalikHybridHome
