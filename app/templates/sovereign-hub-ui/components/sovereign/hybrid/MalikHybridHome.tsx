"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowUp,
  BookOpen,
  Brain,
  Code2,
  Film,
  Github,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  Lightbulb,
  MoreHorizontal,
  Music2,
  Paperclip,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react"
import { prefetchChatShell } from "@/lib/studio-prefetch"
import { PREFILL_EVENT, takePrefillPrompt, useContextEnabled } from "@/lib/malik-context"
import { DEFAULT_MALIK_MODEL_ID, type MalikModelId } from "@/lib/ai/malik-models"
import { loadResponseDepth, type ChatSendOptions } from "@/lib/ai/response-depth"
import { useWebSearchEnabled } from "@/lib/ai/web-search-preference"
import type { AIPlan } from "@/lib/ai/types"
import type { MalikTemplate } from "@/lib/malik-template-registry"
import { MalikModelSelector } from "../MalikModelSelector"
import type { ChatAttachment } from "../chat-view"
import type { AiModeId } from "../power-registry"
import { VoiceWaveIcon } from "@/components/voice/VoiceWaveIcon"
import { normalizeClientImage } from "@/lib/media/client-image-normalize"
import { ChatDrawingPad } from "../ChatDrawingPad"
import { ChatLibraryPicker } from "../ChatLibraryPicker"
import { ChatImageCreator, type ChatImageResolution } from "../ChatImageCreator"
import { ComposerToolMenu } from "../composer-tools/ComposerToolMenu"
import { ConnectorChip, ResearchChip } from "../composer-tools/ConnectorChip"
import { CONNECTOR_NAME, composerPlaceholder, withConnector, type ComposerToolId, type ConnectorId, type ResearchMode } from "../composer-tools/model"
import { refreshConnectorStatus, rememberPendingConnector, useConnectorReturn } from "../composer-tools/useConnectorStatus"
import { prepareFolder } from "@/lib/uploads/folder-digest"

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

const MAX_HOME_ATTACHMENTS = 12
const MAX_HOME_VIDEO_SECONDS = 10
const MAX_HOME_VIDEO_BYTES = 150 * 1024 * 1024
const HOME_VIDEO_FRAME_COUNT = 6
const HOME_VIDEO_LONG_EDGE = 960
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

const MOBILE_SOURCE_ACTION_LABELS: Record<string, string> = {
  web: "Создать",
  github: "Исследовать",
  wikipedia: "Помощь",
  arxiv: "Больше",
}

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

function blobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || "")
      resolve(dataUrl.includes(",") ? dataUrl.split(",").pop() || "" : dataUrl)
    }
    reader.onerror = () => reject(new Error("Не удалось подготовить кадр видео."))
    reader.readAsDataURL(blob)
  })
}

async function sampleHomeVideoFrames(file: File, durationSeconds: number) {
  const video = document.createElement("video")
  const objectUrl = URL.createObjectURL(file)
  video.preload = "auto"
  video.muted = true
  video.playsInline = true

  const waitFor = (eventName: "loadeddata" | "seeked", timeoutMs: number) =>
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener(eventName, done)
        video.removeEventListener("error", fail)
        window.clearTimeout(timer)
      }
      const done = () => { cleanup(); resolve() }
      const fail = () => { cleanup(); reject(new Error(`Не удалось декодировать ${file.name}.`)) }
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new Error(`Не удалось подготовить кадры ${file.name}.`))
      }, timeoutMs)
      video.addEventListener(eventName, done, { once: true })
      video.addEventListener("error", fail, { once: true })
    })

  try {
    video.src = objectUrl
    video.load()
    if (video.readyState < 2) await waitFor("loadeddata", 15_000)

    const sourceWidth = Math.max(1, video.videoWidth || 1)
    const sourceHeight = Math.max(1, video.videoHeight || 1)
    const scale = Math.min(1, HOME_VIDEO_LONG_EDGE / Math.max(sourceWidth, sourceHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))
    const context = canvas.getContext("2d", { alpha: false })
    if (!context) throw new Error("Canvas unavailable")

    const safeDuration = Math.max(0.05, durationSeconds)
    const frameCount = Math.min(HOME_VIDEO_FRAME_COUNT, Math.max(3, Math.ceil(safeDuration * 0.75)))
    const frames: NonNullable<ChatAttachment["analysisFrames"]> = []

    for (let index = 0; index < frameCount; index += 1) {
      const ratio = frameCount === 1 ? 0 : index / (frameCount - 1)
      const timestampSeconds = Math.min(
        Math.max(0, safeDuration - 0.05),
        Math.max(0, ratio * Math.max(0, safeDuration - 0.05)),
      )
      if (Math.abs(video.currentTime - timestampSeconds) > 0.02) {
        video.currentTime = timestampSeconds
        await waitFor("seeked", 10_000)
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const frameBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.76))
      if (!frameBlob?.size) continue
      frames.push({
        name: `${file.name.replace(/\.[^.]+$/, "") || "video"}-frame-${index + 1}.jpg`,
        mime: "image/jpeg",
        base64: await blobAsBase64(frameBlob),
        timestampSeconds,
      })
    }

    canvas.width = 1
    canvas.height = 1
    if (frames.length < 2) throw new Error(`Не удалось извлечь достаточно кадров из ${file.name}.`)
    return frames
  } finally {
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
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

  if (isImage) {
    const normalized = await normalizeClientImage(file)
    return {
      id: attachmentId(),
      name: normalized.name,
      mime: normalized.mime,
      size: normalized.size,
      kind: "image",
      base64: normalized.base64,
      url: normalized.previewUrl,
    }
  }

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

  if (isVideo) {
    if (file.size > MAX_HOME_VIDEO_BYTES) {
      throw new Error(`${file.name}: видео слишком большое. Максимум 150 MB для анализа до 10 сек.`)
    }
    const durationSeconds = await videoDurationSeconds(file)
    if (durationSeconds > MAX_HOME_VIDEO_SECONDS + 0.05) {
      throw new Error(`${file.name}: видео ${durationSeconds.toFixed(1)} сек. Malik AI читает видео до 10 сек.`)
    }

    try {
      return {
        id: attachmentId(),
        name: file.name || "video.mp4",
        mime,
        size: file.size,
        kind: "video",
        durationSeconds,
        analysisFrames: await sampleHomeVideoFrames(file, durationSeconds),
        url: URL.createObjectURL(file),
      }
    } catch (error) {
      if (file.size <= 8 * 1024 * 1024) {
        return {
          id: attachmentId(),
          name: file.name || "video.mp4",
          mime,
          size: file.size,
          kind: "video",
          durationSeconds,
          base64: await readAsBase64(file),
          url: URL.createObjectURL(file),
        }
      }
      throw error
    }
  }

  if (file.size > MAX_HOME_BINARY_BYTES) {
    throw new Error(`${file.name}: слишком большой файл для чата. Максимум 10 MB.`)
  }

  const supportedBinary =
    isImage ||
    mime.startsWith("audio/") ||
    mime === "application/pdf" ||
    mime.includes("officedocument")
  if (!supportedBinary) {
    throw new Error(`${file.name}: этот формат пока не поддерживается для анализа.`)
  }

  const base64 = await readAsBase64(file)
  return {
    id: attachmentId(),
    name: file.name || (isImage ? "image.jpg" : "document"),
    mime,
    size: file.size,
    kind: isImage ? "image" : mime.startsWith("audio/") ? "audio" : "file",
    base64,
    url: isImage ? URL.createObjectURL(file) : undefined,
  }
}

export interface MalikHybridHomeProps {
  onSubmit: (prompt: string, attachments?: ChatAttachment[], options?: ChatSendOptions) => void
  isLoading?: boolean
  onOpenCodex?: () => void
  onOpenTemplates?: () => void
  onOpenPhoto?: () => void
  onOpenVideo?: () => void
  onOpenMusic?: () => void
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
  deepOn = false,
  onToggleDeep,
  onOpenCode,
  onOpenVideo,
  onOpenMusic,
  onSourcePlugin,
  onCreateImage,
  connector,
  notice,
  onChooseTool,
  onClearConnector,
  onSelectFolder,
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
  onSubmit: (nativeDraft?: string) => void
  onToggleWeb: () => void
  onToggleMemory: () => void
  /** «Глубокий анализ»: the next answer is a deep, sourced one. */
  deepOn?: boolean
  onToggleDeep?: () => void
  onOpenCode?: () => void
  onOpenVideo?: () => void
  onOpenMusic?: () => void
  /** GitHub / Wikipedia / arXiv: search a particular source for the next question. */
  onSourcePlugin?: (prompt: string) => void
  onCreateImage?: () => void
  /** GitHub or Gmail: where the next message goes, or null. */
  connector: ConnectorId | null
  /** A neutral note (what a folder upload added). */
  notice: string
  /** Rows of the «+» menu that need the page's state: modes, connections, image studio. */
  onChooseTool: (id: ComposerToolId) => void
  onClearConnector: () => void
  onSelectFolder: (files: File[]) => void
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
  const plusRef = useRef<HTMLButtonElement>(null)
  const closeTools = useCallback(() => setToolsOpen(false), [])
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  // The desktop design asks for a fuller prompt line than the phone one.
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)")
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener?.("change", sync)
    return () => query.removeEventListener?.("change", sync)
  }, [])
  const [dragActive, setDragActive] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [drawingOpen, setDrawingOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const allInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "")
    folderInputRef.current?.setAttribute("directory", "")
  }, [])

  useEffect(() => {
    const field = textareaRef.current
    if (!field) return
    const mobile = window.matchMedia("(max-width: 767px)").matches
    const priority = mobile ? "important" : ""
    field.style.setProperty("height", "0px", priority)
    field.style.setProperty("height", `${Math.min(Math.max(field.scrollHeight, mobile ? 44 : 54), 220)}px`, priority)
  }, [prompt])


  useEffect(() => {
    if (!moreOpen) return
    const close = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false) }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [moreOpen])

  const fromMore = (action?: () => void) => {
    action?.()
    setMoreOpen(false)
  }

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

  const research: ResearchMode = deepOn ? "deep" : webOn ? "web" : "off"
  const chooseTool = (id: ComposerToolId) => {
    if (id === "upload") allInputRef.current?.click()
    else if (id === "folder") folderInputRef.current?.click()
    else if (id === "library") setLibraryOpen(true)
    else if (id === "draw") setDrawingOpen(true)
    else onChooseTool(id)
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
            ref={plusRef}
            type="button"
            onClick={() => setToolsOpen((open) => !open)}
            className={cn("thome-icon-button thome-plus-button", toolsOpen && "is-open")}
            aria-label="Добавить в сообщение"
            aria-expanded={toolsOpen}
            aria-haspopup="menu"
            aria-controls="malik-composer-tools"
          >
            <Plus aria-hidden="true" />
          </button>

          <ComposerToolMenu open={toolsOpen} anchor={plusRef.current} research={research} connector={connector} onSelect={chooseTool} onClose={closeTools} />

          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              // The whole folder is read; the digest decides what is worth sending.
              onSelectFolder(Array.from(event.currentTarget.files || []))
              event.currentTarget.value = ""
            }}
          />

          <input
            ref={allInputRef}
            type="file"
            accept={`image/*,video/*,${HOME_FILE_ACCEPT}`}
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              onSelectMediaFiles(Array.from(event.currentTarget.files || []))
              event.currentTarget.value = ""
            }}
          />

          <ChatLibraryPicker
            open={libraryOpen}
            onClose={() => setLibraryOpen(false)}
            maxSelect={Math.max(1, MAX_HOME_ATTACHMENTS - attachments.length)}
            onSelect={async (url) => {
              const ok = await importRemoteAsFile(url)
              if (!ok) throw new Error("Не удалось прикрепить файл из библиотеки")
            }}
          />
          <ChatDrawingPad
            open={drawingOpen}
            onClose={() => setDrawingOpen(false)}
            onAttach={async (file) => onSelectMediaFiles([file])}
          />
        </div>

        <textarea
          ref={textareaRef}
          value={prompt}
          onFocus={prefetchChatShell}
          onChange={(event) => {
            if (event.currentTarget.value.trim()) prefetchChatShell()
            onPromptChange(event.currentTarget.value)
          }}
          onInput={(event) => onPromptChange(event.currentTarget.value)}
          onCompositionEnd={(event) => onPromptChange(event.currentTarget.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            // Backspace in an empty field removes the connection chip.
            if (event.key === "Backspace" && connector && !event.currentTarget.value) { onClearConnector(); return }
            if (event.key === "Enter" && !event.shiftKey) {
              if (event.nativeEvent.isComposing) return
              event.preventDefault()
              onSubmit(event.currentTarget.value)
            }
          }}
          rows={1}
          aria-label="Спросите Malik AI"
          placeholder={composerPlaceholder(wide ? "Напишите сообщение или задайте вопрос…" : "Чем я могу помочь сегодня?", research, connector)}
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
              onClick={() => onSubmit(textareaRef.current?.value)}
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

      {deepOn && onToggleDeep ? (
        <div className="thome-connector mct-phone-only">
          <ResearchChip mode="deep" onClear={onToggleDeep} />
        </div>
      ) : null}
      {connector ? (
        <div className="thome-connector">
          <ConnectorChip
            connector={connector}
            showSuggestions={!prompt.trim()}
            onClear={onClearConnector}
            onSuggestion={(text) => { onPromptChange(text); window.setTimeout(() => textareaRef.current?.focus(), 0) }}
          />
        </div>
      ) : null}
      {notice ? <div className="thome-connector mct-notice" role="status" data-composer-notice>{notice}</div> : null}

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

      {/* Modes and studios, as on the design: two toggles for the next answer
          and studio shortcuts; GitHub, Wikipedia, arXiv and memory sit under «…». */}
      <div className="thome-chips" role="toolbar" aria-label="Режимы и инструменты">
        <button type="button" aria-pressed={webOn} onClick={onToggleWeb} className={cn("thome-chip", webOn && "is-active")} title={webOn ? "Веб-поиск включён: ответ сам найдёт и покажет источники" : "Веб-поиск выключен"}>
          <Globe aria-hidden="true" />Веб-поиск
        </button>
        {onToggleDeep ? (
          <button type="button" aria-pressed={deepOn} onClick={onToggleDeep} className={cn("thome-chip", deepOn && "is-active")} title="Глубокий анализ с источниками для следующего вопроса">
            <Lightbulb aria-hidden="true" />Глубокий анализ
          </button>
        ) : null}
        {onOpenCode ? <button type="button" onClick={onOpenCode} className="thome-chip"><Code2 aria-hidden="true" />Код</button> : null}
        {onCreateImage ? (
          <button type="button" onClick={onCreateImage} className="thome-chip" title={imageCredits ? `Фото: ${imageCredits.remaining > 1_000_000 ? "∞" : imageCredits.remaining} кр. сегодня` : undefined}>
            <ImageIcon aria-hidden="true" />Изображение
          </button>
        ) : null}
        {onOpenVideo ? <button type="button" onClick={onOpenVideo} className="thome-chip"><Film aria-hidden="true" />Видео</button> : null}
        {onOpenMusic ? <button type="button" onClick={onOpenMusic} className="thome-chip"><Music2 aria-hidden="true" />Музыка</button> : null}
        <div className="thome-chip-more" ref={moreRef}>
          <button type="button" onClick={() => setMoreOpen((open) => !open)} className={cn("thome-chip is-icon", moreOpen && "is-active")} aria-label="Ещё инструменты" aria-haspopup="menu" aria-expanded={moreOpen}>
            <MoreHorizontal aria-hidden="true" />
          </button>
          {moreOpen ? (
            <div className="thome-more-menu" role="menu" aria-label="Ещё инструменты">
              {SOURCE_PLUGINS.filter((plugin) => plugin.id !== "web").map((plugin) => {
                const Icon = plugin.icon
                return (
                  <button key={plugin.id} type="button" role="menuitem" onClick={() => fromMore(() => onSourcePlugin?.(plugin.prompt))}>
                    <Icon aria-hidden="true" /><span>Искать в {plugin.label}</span>
                  </button>
                )
              })}
              <span className="thome-more-menu__rule" role="separator" />
              <button type="button" role="menuitemcheckbox" aria-checked={memoryOn} onClick={() => fromMore(onToggleMemory)}>
                <Brain aria-hidden="true" /><span>Память {memoryOn ? "включена" : "выключена"}</span>
              </button>
              <span className="thome-more-menu__note">
                <ImageIcon aria-hidden="true" />Фото: {imageCredits ? (imageCredits.remaining > 1_000_000 ? "∞" : imageCredits.remaining) : "…"} кр. сегодня
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function MalikHybridHomeInner(props: MalikHybridHomeProps) {
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState("")
  const [imageCredits, setImageCredits] = useState<{
    remaining: number
    daily: number
    costs: Record<ChatImageResolution, number>
    remaining4k: number
  } | null>(null)
  const [imageCreatorOpen, setImageCreatorOpen] = useState(false)
  /** GitHub or Gmail: the next messages go to that connection until the chip is removed. */
  const [connector, setConnector] = useState<ConnectorId | null>(null)
  const [composerNotice, setComposerNotice] = useState("")
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [webOn, setWebOn] = useWebSearchEnabled()
  const [memoryOn, setMemoryOn] = useContextEnabled()
  const [deepResearch, setDeepResearch] = useState(false)
  const [mobileLayout, setMobileLayout] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = () => setMobileLayout(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  // The home artwork fills the whole main column, behind the Чат/Работа switch
  // too (malik-cosmos-home.css), so its flag lives on <html>.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.malikChatHome = "1"
    return () => { delete root.dataset.malikChatHome }
  }, [])

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
            costs: {
              "1K": Number(payload?.costs?.["1K"] ?? 1),
              "2K": Number(payload?.costs?.["2K"] ?? 2),
              "4K": Number(payload?.costs?.["4K"] ?? 5),
            },
            remaining4k: Number(payload.remaining4k ?? 0),
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

  const submit = (nativeDraft?: string) => {
    // Two HomeComposer instances exist (desktop + mobile). Use the field that
    // actually submitted, never the hidden desktop textarea selected globally.
    const text = (nativeDraft || prompt).trim()
    if ((!text && !attachments.length) || props.isLoading) return

    const attachmentPrompt = attachments.some((item) => item.kind === "video")
      ? "Проанализируй прикреплённое видео и подробно ответь по его содержанию."
      : attachments.some((item) => item.kind === "image")
        ? "Проанализируй прикреплённое изображение и подробно ответь по его содержанию."
        : "Прочитай прикреплённые файлы и подробно ответь по их содержанию."

    try {
      props.onSubmit(withConnector(text || attachmentPrompt, connector), attachments, {
        research: webOn,
        responseDepth: deepResearch ? "deep" : loadResponseDepth(props.userPlan || "free"),
      })
    } catch (error) {
      setPrompt(text)
      setAttachmentError(error instanceof Error ? error.message : "Не удалось отправить сообщение.")
      return
    }
    setPrompt("")
    setAttachments([])
    setAttachmentError("")
    setComposerNotice("")
    setDeepResearch(false)
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
    setDeepResearch(false)
    prefetchChatShell()
    focusPrompt(pluginPrompt)
  }

  // Deep analysis needs the web: turning it on turns search on too.
  const toggleDeepResearch = () => {
    const next = !deepResearch
    setDeepResearch(next)
    if (next) setWebOn(true)
  }

  const focusVisiblePrompt = () => {
    window.setTimeout(() => {
      const field = Array.from(document.querySelectorAll<HTMLTextAreaElement>(".thome-composer textarea"))
        .find((candidate) => candidate.getClientRects().length > 0)
      if (!field) return
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    }, 0)
  }

  /** Official OAuth; on return the connection's chip switches on by itself. */
  const connectAccount = (id: ConnectorId) => {
    rememberPendingConnector(id)
    const current = new URL(window.location.href)
    const returnTo = `${current.pathname}${current.search}${current.hash}` || "/dashboard"
    window.location.assign(`/api/plugins/connect?id=${encodeURIComponent(id)}&return_to=${encodeURIComponent(returnTo)}`)
  }

  /** «+» rows that need this page's state. The draft is never lost. */
  const chooseTool = (id: ComposerToolId) => {
    setAttachmentError("")
    if (id === "image") { setImageCreatorOpen(true); return }
    if (id === "web") {
      const next = !webOn || deepResearch
      setWebOn(next)
      setDeepResearch(false)
      prefetchChatShell()
      focusVisiblePrompt()
      return
    }
    if (id === "deep") {
      toggleDeepResearch()
      prefetchChatShell()
      focusVisiblePrompt()
      return
    }
    if (id !== "github" && id !== "gmail") return
    if (connector === id) { setConnector(null); focusVisiblePrompt(); return }
    void refreshConnectorStatus().then((status) => {
      const state = status[id].state
      if (state === "connected") { setConnector(id); prefetchChatShell(); focusVisiblePrompt() }
      else if (state === "sign_in") window.location.assign("/sign-in")
      else if (state !== "unavailable") connectAccount(id)
    })
  }

  useConnectorReturn((id, ok) => {
    if (!ok) { setAttachmentError(`Не удалось подключить ${CONNECTOR_NAME[id]}. Попробуйте ещё раз.`); return }
    setConnector(id)
    setComposerNotice(`${CONNECTOR_NAME[id]} подключён. Следующее сообщение уйдёт в ${CONNECTOR_NAME[id]}.`)
    focusVisiblePrompt()
  })

  useEffect(() => {
    if (!composerNotice) return
    const timer = window.setTimeout(() => setComposerNotice(""), 14_000)
    return () => window.clearTimeout(timer)
  }, [composerNotice])

  const addFolder = async (files: File[]) => {
    if (!files.length) return
    setAttachmentError("")
    setComposerNotice("Разбираю папку…")
    const prepared = await prepareFolder(files, Math.max(0, MAX_HOME_ATTACHMENTS - attachments.length))
    if (prepared.error) { setComposerNotice(""); setAttachmentError(prepared.error); return }
    const added: ChatAttachment[] = []
    if (prepared.document) {
      added.push({ id: attachmentId(), name: prepared.document.name, mime: "text/markdown", size: prepared.document.size, kind: "file", text: prepared.document.text })
    }
    let failed = 0
    for (const file of prepared.media) {
      try { added.push(await homeFileToAttachment(file)) } catch { failed += 1 }
    }
    setAttachments((previous) => [...previous, ...added].slice(0, MAX_HOME_ATTACHMENTS))
    setComposerNotice(prepared.notice + (failed ? ` Не прочитались: ${failed}.` : ""))
  }

  return (
    <div className="thome">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void addFiles(Array.from(event.currentTarget.files || []))
          event.currentTarget.value = ""
        }}
      />

      {imageCreatorOpen ? (
        <ChatImageCreator
          attachments={attachments}
          credits={imageCredits}
          plan={props.userPlan}
          onAddImage={() => imageInputRef.current?.click()}
          onAddFiles={(files) => void addFiles(files)}
          onRemoveAttachment={removeAttachment}
          onClose={() => setImageCreatorOpen(false)}
        />
      ) : null}


      <div className="thome-inner">
        <section className="thome-launcher" aria-label="Malik AI">
          <div className="thome-welcome">
            <span className="thome-welcome-logo" aria-hidden="true">
              <svg viewBox="8.5 14.5 30 15">
                <path d="M9 29 L22 15 L22 29 Z" fill="currentColor" />
                <path d="M24 15 H38 L24 29 Z" fill="currentColor" />
              </svg>
            </span>
            <h1 aria-label="Malik AI">
              <strong>
                <span className="thome-word is-1">Malik</span>{" "}
                <span className="thome-word is-2">AI</span>
              </strong>
            </h1>
            <p className="thome-welcome-tagline">Ваш универсальный ИИ-ассистент</p>
            <p className="thome-welcome-subtitle">
              Задавайте любые вопросы, получайте идеи, тексты, изображения, анализ, решения и многое другое.
            </p>
            <p className="thome-welcome-motto"><span>More than AI</span><span>A brighter tomorrow</span></p>

            <HomeComposer
              prompt={prompt}
              isLoading={props.isLoading}
              webOn={webOn}
              memoryOn={memoryOn}
              attachments={attachments}
              attachmentError={attachmentError}
              onPromptChange={setPrompt}
              onSubmit={submit}
              onToggleWeb={() => { setWebOn(!webOn); if (webOn) setDeepResearch(false) }}
              onToggleMemory={() => setMemoryOn(!memoryOn)}
              deepOn={deepResearch}
              onToggleDeep={toggleDeepResearch}
              onOpenCode={props.onOpenCode}
              onOpenVideo={props.onOpenVideo}
              onOpenMusic={props.onOpenMusic}
              onSourcePlugin={openSourcePlugin}
              onCreateImage={() => setImageCreatorOpen(true)}
              connector={connector}
              notice={composerNotice}
              onChooseTool={chooseTool}
              onClearConnector={() => { setConnector(null); focusVisiblePrompt() }}
              onSelectFolder={(files) => { void addFolder(files) }}
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
                    onClick={() => {
                      if (!mobileLayout) {
                        openSourcePlugin(plugin.prompt)
                        return
                      }
                      // Real actions now match the four labels painted on phones.
                      if (plugin.id === "web") {
                        setImageCreatorOpen(true)
                      } else if (plugin.id === "github") {
                        setWebOn(true)
                        setDeepResearch(true)
                        focusPrompt("Проведи глубокое исследование с актуальными источниками по теме: ")
                      } else if (plugin.id === "wikipedia") {
                        focusPrompt("Помоги мне решить задачу: ")
                      } else if (plugin.id === "arxiv") {
                        props.onOpenCapabilities?.()
                      }
                    }}
                    aria-label={mobileLayout ? MOBILE_SOURCE_ACTION_LABELS[plugin.id] : plugin.label}
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
                  onToggleWeb={() => { setWebOn(!webOn); if (webOn) setDeepResearch(false) }}
                  onToggleMemory={() => setMemoryOn(!memoryOn)}
                  deepOn={deepResearch}
                  onToggleDeep={toggleDeepResearch}
                  onOpenCode={props.onOpenCode}
                  onOpenVideo={props.onOpenVideo}
                  onOpenMusic={props.onOpenMusic}
                  onSourcePlugin={openSourcePlugin}
                  onCreateImage={() => setImageCreatorOpen(true)}
                  connector={connector}
                  notice={composerNotice}
                  onChooseTool={chooseTool}
                  onClearConnector={() => { setConnector(null); focusVisiblePrompt() }}
                  onSelectFolder={(files) => { void addFolder(files) }}
                  onSelectMediaFiles={(files) => { void addFiles(files) }}
                  onRemoveAttachment={removeAttachment}
                  selectedModelId={props.selectedModelId || DEFAULT_MALIK_MODEL_ID}
                  userPlan={props.userPlan || "free"}
                  onModelChange={props.onModelChange || (() => {})}
                  onOpenBilling={props.onOpenBilling}
                  onOpenVoice={props.onOpenVoice}
                  imageCredits={imageCredits}
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
