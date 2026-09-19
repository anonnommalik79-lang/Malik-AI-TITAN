"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MalikMarkdown } from "./MalikMarkdown"
import {
  BookOpen,
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
  Lightbulb,
  Mic,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Share,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Video,
  Volume2,
  Wand2,
  X,
  Loader2,
} from "lucide-react"
import type { GenerationStatusType } from "./generation-status"
import type { AIPlan } from "@/lib/ai/types"
import type { MalikMessageResearch, MalikResearchStep, MalikWebSource } from "@/lib/ai/web-research-types"
import { DEFAULT_MALIK_MODEL_ID, getMalikModel, type MalikModelId } from "@/lib/ai/malik-models"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { MalikModelSelector } from "./MalikModelSelector"
import { canUseUltra, loadResponseDepth, type ChatSendOptions, type ResponseDepth } from "@/lib/ai/response-depth"
import { VoiceWaveIcon } from "@/components/voice/VoiceWaveIcon"
import { isExplicitImageEditRequest, isExplicitImageGenerationRequest } from "@/lib/ai/image-intent"
import { isDataSvgUrl, isImageLikeUrl, isRealVideoUrl } from "@/lib/media/media-url"
import { ImageGenerationMotion } from "./image-generation-motion"
import type { MalikActionPlan, MalikActionTarget } from "@/lib/ai/action-os"

export type { ChatSendOptions }

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

const MALIK_CHATVIEW_SAFE_TEXT = ""

function isChatViewBadText(value: string) {
  const text = String(value || "")
  const commaCount = (text.match(/,/g) || []).length
  const perSpamCount = (text.match(/\bper[-\w]*/gi) || []).length
  const badMarks = [
    "\u00D0", "\u00D1", "\u00E2",
    "\u0420\u045F", "\u0420\u0491", "\u0420\u0451", "\u0420\u00B0", "\u0420\u00B5", "\u0421\u0453", "\u0421\u201A", "\u0421\u0152",
    "\u0413\u0452", "\u0413\u2018", "\u0413\u045E"
  ]

  return (
    !text.trim() ||
    badMarks.some((mark) => text.includes(mark)) ||
    /CURRENT\s+(USER|TIME|DATE|YEAR|LANGUAGE|DOMAIN|CONTEXT):/i.test(text) ||
    /\[(SOVEREIGN_MALIK_AI_RUNTIME|CHAT_MODE|MALIK_SOVEREIGN_DASHBOARD_KERNEL_V2|MALIK_RESPONSE_DEPTH_[A-Z]+)\]/i.test(text) ||
    /Mode:\s*choose\s+(chat|code|canvas|Codex|media)\s+flow/i.test(text) ||
    /^\s*(START:|BEGIN:|END:)\s*$/i.test(text) ||
    /^[,;:]/.test(text.trim()) ||
    commaCount >= 25 ||
    perSpamCount >= 5
  )
}

function cleanChatViewText(value: string) {
  const text = String(value || "").trim()
  return isChatViewBadText(text) ? "" : text
}


interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isStreaming?: boolean
  username?: string
  modelId?: MalikModelId
  research?: MalikMessageResearch
  generatedMedia?: InlineMediaGeneration
  imageConfirmation?: ImageGenerationConfirmation
  actionPlan?: MalikActionPlan
  attachments?: ChatAttachment[]
}

type ImageResolution = "1K" | "2K" | "4K"

type ImageGenerationConfirmation = {
  prompt: string
  status: "pending" | "confirmed" | "generating" | "cancelled"
  imageSize?: ImageResolution
}

type ImageCreditSnapshot = {
  remaining: number
  daily: number
  used: number
  costs: Record<ImageResolution, number>
  max4kPerDay: number
  used4k: number
  remaining4k: number
  resetAt?: string
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
  /** Inline copy of the finished image, used only when `url` cannot be loaded. */
  fallbackUrl?: string
  /** What Malik understood the request to be, shown while the picture renders. */
  understood?: string
  thumbnailUrl?: string
  jobId?: string
  statusUrl?: string
  error?: string
  createdAt?: string
}

interface ChatViewProps {
  messages: Message[]
  onSendMessage: (message: string, attachments?: ChatAttachment[], options?: ChatSendOptions) => void
  onImageConfirmation?: (messageId: string, prompt: string, action: "confirm" | "cancel" | "generate", imageSize?: ImageResolution) => void
  isLoading?: boolean
  streamingText?: string
  currentUser?: string
  userPlan?: AIPlan
  selectedModelId?: MalikModelId
  onModelChange?: (modelId: MalikModelId) => void
  onOpenBilling?: () => void
  onOpenPlugins?: () => void
  onOpenCodex?: () => void
  onForceCanvas?: () => void
  onOpenVoice?: () => void
  onOpenActionTarget?: (target: MalikActionTarget) => void
  projectName?: string
  projectDescription?: string
}

const MAX_BINARY_FILE_SIZE = 10 * 1024 * 1024
const MAX_TEXT_FILE_SIZE = 12 * 1024 * 1024
const MAX_INLINE_TEXT_CHARS = 600_000
const TEXT_UPLOAD_EXTENSIONS = new Set([
  "txt", "md", "mdx", "csv", "tsv", "json", "jsonl", "yaml", "yml", "xml", "html", "htm", "css",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "kt", "go", "rs", "rb", "php", "swift",
  "c", "h", "cpp", "hpp", "cs", "sql", "sh", "bash", "zsh", "ps1", "toml", "ini", "env", "log",
])
const CODE_UPLOAD_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "kt", "go", "rs", "rb", "php", "swift",
  "c", "h", "cpp", "hpp", "cs", "sql", "sh", "bash", "zsh", "ps1", "html", "css",
])

function uploadExtension(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ""
}

function inferUploadMime(file: File) {
  if (file.type) return file.type
  const ext = uploadExtension(file.name)
  if (ext === "pdf") return "application/pdf"
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  if (ext === "json") return "application/json"
  if (ext === "csv") return "text/csv"
  if (TEXT_UPLOAD_EXTENSIONS.has(ext)) return "text/plain"
  return "application/octet-stream"
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const mime = inferUploadMime(file)
  const ext = uploadExtension(file.name)
  const textLike = mime.startsWith("text/") || mime === "application/json" || TEXT_UPLOAD_EXTENSIONS.has(ext)

  if (textLike) {
    if (file.size > MAX_TEXT_FILE_SIZE) {
      throw new Error(`Файл слишком большой: ${file.name}. Лимит 12MB для текстового файла.`)
    }
    const text = (await file.text()).slice(0, MAX_INLINE_TEXT_CHARS)
    return {
      id: crypto.randomUUID(),
      name: file.name,
      mime,
      size: file.size,
      kind: CODE_UPLOAD_EXTENSIONS.has(ext) ? "code" : "file",
      text,
    }
  }

  if (file.size > MAX_BINARY_FILE_SIZE) {
    throw new Error(`Файл слишком большой: ${file.name}. Лимит 10MB для бинарного вложения в чат.`)
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })
  const base64 = dataUrl.includes(",") ? dataUrl.split(",").pop() || "" : dataUrl
  const kind: ChatAttachment["kind"] = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : "file"
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mime,
    size: file.size,
    kind,
    base64,
    url: kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined,
  }
}


function attachmentFromSharedFile(file: any): ChatAttachment | null {
  const base64 = String(file?.base64 || "")
  const mime = String(file?.mime || "application/octet-stream")
  if (!base64 || (!mime.startsWith("image/") && !mime.startsWith("video/") && mime !== "application/pdf")) return null
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime })
    const kind: ChatAttachment["kind"] = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "file"
    return {
      id: crypto.randomUUID(),
      name: String(file?.name || "shared-media"),
      mime,
      size: Number(file?.size || blob.size),
      kind,
      base64,
      url: kind === "image" || kind === "video" ? URL.createObjectURL(blob) : undefined,
    }
  } catch {
    return null
  }
}


function detectGenerationStatusType(text: string): GenerationStatusType {
  const value = text.toLowerCase().trim()

  // COST GUARD:
  // Never auto-route normal chat to paid media generation.
  // Only explicit slash commands show media mode.
  if (value.startsWith("/image ") || value.startsWith("/photo ") || value.startsWith("/img ")) return "image"
  if (isExplicitImageGenerationRequest(text)) return "image"
  if (value.startsWith("/video ") || value.startsWith("/veo ")) return "video"
  if (value.startsWith("/file ") || value.startsWith("/document ")) return "file"
  if (value.startsWith("/codex ") || value.startsWith("/agent ")) return "codex"
  if (value.startsWith("/code ")) return "code"
  if (value.startsWith("/website ") || value.startsWith("/site ") || value.startsWith("/landing ")) return "website"

  return "text"
}

function attachmentPreviewSrc(item: ChatAttachment) {
  if (typeof item.url === "string" && /^(?:blob:|data:|https?:)/i.test(item.url)) return item.url
  if (item.base64 && (item.kind === "image" || item.kind === "video")) {
    return `data:${item.mime || (item.kind === "image" ? "image/jpeg" : "video/mp4")};base64,${item.base64}`
  }
  return ""
}

function AttachmentPill({ item, onRemove }: { item: ChatAttachment; onRemove: () => void }) {
  const preview = attachmentPreviewSrc(item)
  if ((item.kind === "image" || item.kind === "video") && preview) {
    return (
      <div className="malik-composer-attachment-preview group relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[16px] border border-white/10 bg-black">
        {item.kind === "image" ? (
          <img src={preview} alt={item.name || "Изображение"} className="h-full w-full object-cover" />
        ) : (
          <video src={preview} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        )}
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-black/75 text-white shadow-lg backdrop-blur"
          aria-label="Убрать вложение"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const Icon = item.kind === "audio" ? Volume2 : item.kind === "code" ? Code : item.kind === "url" ? LinkIcon : FileText
  return (
    <div className="group flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-slate-300">
      <Icon className="h-4 w-4 shrink-0 text-zinc-300" />
      <span className="truncate">{item.name || item.url}</span>
      <button type="button" onClick={onRemove} className="ml-1 rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-white">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function UserAttachmentPreview({ item }: { item: ChatAttachment }) {
  const [previewFailed, setPreviewFailed] = useState(false)
  const src = attachmentPreviewSrc(item)
  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return ""
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  }

  if (item.kind === "image" && src && !previewFailed) {
    return (
      <figure title={item.name} className="malik-user-attachment malik-user-attachment--image h-[152px] w-[152px] shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-black/30 sm:h-[168px] sm:w-[168px]">
        <img
          src={src}
          alt={item.name || "Прикреплённое изображение"}
          className="block h-full w-full object-cover"
          loading="eager"
          onError={() => setPreviewFailed(true)}
        />
      </figure>
    )
  }

  if (item.kind === "video" && src && !previewFailed) {
    return (
      <figure title={item.name} className="malik-user-attachment malik-user-attachment--video h-[152px] w-[152px] shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-black/40 sm:h-[168px] sm:w-[168px]">
        <video
          src={src}
          className="block h-full w-full bg-black object-cover"
          controls
          playsInline
          preload="metadata"
          onError={() => setPreviewFailed(true)}
        />
      </figure>
    )
  }

  const Icon = item.kind === "audio" ? Volume2 : item.kind === "code" ? Code : FileText
  return (
    <div className="malik-user-attachment flex min-w-0 items-center gap-3 rounded-[16px] border border-white/10 bg-black/20 px-3 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-zinc-300">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs font-medium text-zinc-100">{item.name || "Файл"}</strong>
        <small className="mt-0.5 block text-[10px] uppercase tracking-[0.08em] text-zinc-500">
          {(item.mime || item.kind).split("/").pop()} {formatBytes(item.size)}
        </small>
      </span>
    </div>
  )
}

function UserAttachmentGallery({ items }: { items: ChatAttachment[] }) {
  if (!items.length) return null
  return (
    <div className="mb-2.5 flex max-w-full flex-wrap gap-2" aria-label="Прикреплённые файлы">
      {items.map((item) => <UserAttachmentPreview key={item.id} item={item} />)}
    </div>
  )
}

// Shared with the media pipeline and unit-tested there: a finished file must be
// told apart from a job/status endpoint. See lib/media/media-url.ts.

function isProcessingStatus(status: InlineMediaGenerationStatus) {
  return status === "queued" || status === "thinking" || status === "generating" || status === "rendering"
}

function mediaProgress(media: InlineMediaGeneration) {
  if (media.status === "ready") return 100
  if (media.status === "failed") return 100
  if (typeof media.progress === "number") return Math.min(96, Math.max(4, media.progress))
  if (media.status === "queued") return 8
  if (media.status === "thinking") return 22
  if (media.status === "generating") return 52
  if (media.status === "rendering") return 78
  return 18
}

function GeminiMediaGenerationCard({ media }: { media: InlineMediaGeneration }) {
  const isVideo = media.kind === "video"
  const [liveMedia, setLiveMedia] = useState(media)
  const [pollHint, setPollHint] = useState<string>("")

  useEffect(() => {
    setLiveMedia(media)
  }, [media])

  useEffect(() => {
    const statusUrl = liveMedia.statusUrl || (liveMedia.jobId ? `/api/generate/video/status?provider=aws-bedrock-nova-reel&jobId=${encodeURIComponent(liveMedia.jobId)}` : "")
    const hasFinalVideo = isRealVideoUrl(liveMedia.url || liveMedia.thumbnailUrl)
    const shouldPoll = isProcessingStatus(liveMedia.status) || (liveMedia.status === "ready" && !hasFinalVideo)
    if (!isVideo || !statusUrl || !shouldPoll) return

    let cancelled = false
    let tries = 0
    let timer: number | undefined

    const poll = async () => {
      try {
        tries += 1
        const response = await fetch(statusUrl, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return

        if (payload?.ok && payload?.status === "ready" && (payload?.videoUrl || payload?.url)) {
          const nextUrl = String(payload.videoUrl || payload.url)
          setLiveMedia((previous) => ({
            ...previous,
            status: "ready",
            progress: 100,
            url: nextUrl,
            thumbnailUrl: typeof payload.thumbnailUrl === "string" ? payload.thumbnailUrl : previous.thumbnailUrl,
            provider: payload.engine || previous.provider,
          }))
          return
        }

        if (payload?.status === "failed" || payload?.ok === false) {
          setLiveMedia((previous) => ({
            ...previous,
            status: "failed",
            progress: 100,
            error: payload?.publicError || payload?.error || "Видео не завершилось.",
          }))
          return
        }

        const nextStatus = String(payload?.status || "").toLowerCase(); if (nextStatus === "queued" || nextStatus === "thinking" || nextStatus === "generating" || nextStatus === "rendering") { setLiveMedia((previous) => ({ ...previous, status: nextStatus as InlineMediaGenerationStatus, progress: nextStatus === "queued" ? 8 : nextStatus === "thinking" ? 22 : nextStatus === "generating" ? 52 : 78 })) }; setPollHint("Видео ещё рендерится. Malik AI проверяет статус автоматически.")
      } catch {
        if (!cancelled) setPollHint("Статус видео проверяется. Провайдер может отвечать с задержкой.")
      }

      if (!cancelled && tries < 120) {
        timer = window.setTimeout(poll, 5000)
      }
    }

    timer = window.setTimeout(poll, 1800)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [isVideo, liveMedia.jobId, liveMedia.status, liveMedia.statusUrl])

  const url = liveMedia.url || liveMedia.thumbnailUrl || ""
  const isFailed = liveMedia.status === "failed"
  const isProcessing = isProcessingStatus(liveMedia.status)
  const realVideo = isVideo && liveMedia.status === "ready" && isRealVideoUrl(url)
  const previewImage = Boolean(url) && !isVideo && (isDataSvgUrl(url) || isImageLikeUrl(url))
  const progress = isVideo && liveMedia.status === "ready" && !realVideo ? 82 : mediaProgress(liveMedia)

  // Photo generation has its own clean, no-glass experience. The moving photo
  // field stays alive until the browser has actually loaded the final image;
  // only then does the generated photo fade in and the animation disappear.
  if (!isVideo) {
    return (
      <ImageGenerationMotion
        prompt={liveMedia.prompt}
        resultUrl={previewImage ? url : undefined}
        fallbackUrl={isImageLikeUrl(liveMedia.fallbackUrl) ? liveMedia.fallbackUrl : undefined}
        // The card now follows the job's real lifecycle: a job that finished
        // without a file, or that never finishes at all, ends the animation
        // instead of looping the sketch forever.
        status={liveMedia.status}
        startedAt={liveMedia.createdAt}
        provider={liveMedia.provider}
        understood={liveMedia.understood}
        failed={isFailed}
        error={liveMedia.error}
      />
    )
  }

  const statusLabel: Record<InlineMediaGenerationStatus, string> = {
    queued: "Очередь",
    thinking: "Понимаю идею",
    generating: isVideo ? "Генерирую видео" : "Генерирую изображение",
    rendering: isVideo ? "Рендерю видео" : "Собираю финальный кадр",
    ready: realVideo ? "Готово" : isVideo ? "Рендерю видео" : "Готово",
    failed: "Ошибка генерации",
  }

  const headline = isVideo
    ? realVideo
      ? "Видео готово"
      : liveMedia.status === "ready"
        ? "Видео ещё рендерится"
        : "Видео создаётся"
    : liveMedia.status === "ready"
      ? "Изображение готово"
      : "Изображение создаётся"

  const subline = isFailed
    ? liveMedia.error || "Провайдер не вернул готовый результат."
    : realVideo
      ? "Финальный mp4/webm получен и готов к просмотру."
      : isVideo && liveMedia.status === "ready"
        ? "AWS ещё готовит финальный mp4. Карточка автоматически ждёт настоящий videoUrl."
        : isProcessing
          ? pollHint || "Генератор работает внутри чата. Когда видео будет готово, карточка обновится."
          : "Результат подготовлен внутри чата."

  return (
    <div className="relative w-full max-w-[720px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#050816]/88 p-3 shadow-[0_30px_120px_rgba(0,0,0,.52)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(228, 187, 94,.20),transparent_34%),radial-gradient(circle_at_82%_82%,rgba(217, 174, 69,.22),transparent_40%),linear-gradient(135deg,rgba(255,255,255,.07),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.09] [background-image:linear-gradient(to_right,rgba(255,255,255,.22)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.22)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative overflow-hidden rounded-[1.55rem] border border-white/10 bg-black/55">
        <div className={cn("w-full", isVideo ? "aspect-video" : "aspect-square")}>
          {realVideo ? (
            <video
              src={url}
              poster={liveMedia.thumbnailUrl}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full rounded-[1.55rem] bg-black object-contain"
            />
          ) : previewImage ? (
            <img
              src={url}
              alt={isVideo ? "Video storyboard preview" : liveMedia.prompt || "Generated media"}
              className="h-full w-full rounded-[1.55rem] bg-black object-contain"
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.55rem] bg-[#050507]">
              <div className="absolute h-56 w-56 rounded-full bg-cyan-400/18 blur-[70px]" />
              <div className="absolute h-80 w-80 rounded-full bg-violet-500/16 blur-[90px]" />
              <div className="absolute inset-8 rounded-[2rem] border border-white/10 bg-white/[0.035]" />
              <div className="relative z-10 flex max-w-[320px] flex-col items-center px-6 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_0_45px_rgba(217, 174, 69,.22)] backdrop-blur-xl">
                  {isFailed ? (
                    <X className="h-7 w-7 text-red-100" />
                  ) : isProcessing ? (
                    <Loader2 className="h-7 w-7 animate-spin text-cyan-100" />
                  ) : isVideo ? (
                    <Video className="h-7 w-7 text-cyan-100" />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-cyan-100" />
                  )}
                </div>
                <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-white/70">
                  Malik AI {isVideo ? "Video" : "Image"}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{subline}</p>
              </div>
            </div>
          )}
        </div>

        {!isFailed && !realVideo && (
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/68 p-3 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black uppercase tracking-[0.18em] text-white">{statusLabel[liveMedia.status]}</p>
                <p className="mt-1 truncate text-[11px] text-zinc-500">
                  {liveMedia.provider || (isVideo ? "Bedrock / Runway / Luma" : "Media API")} · {Math.round(progress)}%
                </p>
              </div>
              {isProcessing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-200" /> : <Sparkles className="h-4 w-4 shrink-0 text-cyan-200" />}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-3 rounded-[1.25rem] border border-white/10 bg-black/35 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/65">
            {isVideo ? <Video className="h-3.5 w-3.5 text-cyan-200" /> : <ImageIcon className="h-3.5 w-3.5 text-cyan-200" />}
            {isVideo ? "Video generation" : "Image generation"}
          </span>
          <span className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
            realVideo ? "bg-emerald-300/12 text-emerald-100" : isFailed ? "bg-red-400/12 text-red-100" : liveMedia.status === "ready" ? "bg-violet-300/12 text-violet-100" : "bg-cyan-300/12 text-cyan-100",
          )}>
            {statusLabel[liveMedia.status]}
          </span>
        </div>

        <p className="text-sm font-bold text-white">{headline}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">{subline}</p>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-300">{liveMedia.prompt}</p>

        {realVideo ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-cyan-50">Открыть результат</a>
            <button type="button" onClick={() => navigator.clipboard?.writeText(url)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-zinc-300 transition hover:bg-white/10">Copy link</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function isWorldResearchPrompt(text: string) {
  const value = String(text || "").toLowerCase().trim()
  if (!value) return false

  if (/^(привет|салам|сәлем|hi|hello|hey|йо|ку|здарова|ассалаумағалейкум|assalamu|как дела|қалайсың)[\s.!?]*$/i.test(value)) return false
  if (value.length < 8) return false

  const explicitSearch =
    /(search|google|browse|web|source|sources|link|links|wikipedia|wiki|latest|current|today|now|news|deadline|event|hackathon|competition|official source|check online)/i.test(value) ||
    /(найди|поищи|загугли|гугл|интернет|открыт|источник|источники|ссылк|википед|свеж|актуальн|сейчас|сегодня|новост|дедлайн|мероприят|хакатон|конкурс|соревн|официальн|проверь онлайн|проверь в сети)/i.test(value)

  if (explicitSearch) return true

  const publicFact =
    /(president|ceo|minister|price|schedule|release date|version|law|rules|ranking|rating|weather|exchange rate|stock|crypto)/i.test(value) ||
    /(президент|министр|цена|расписание|релиз|версия|закон|правил|рейтинг|погода|курс валют|акция|крипто)/i.test(value)

  const yearSignal = /\b202[5-9]\b/.test(value)
  return publicFact || (yearSignal && /(who|what|when|where|кто|что|когда|где|какой|какая|какие|қашан|қайда)/i.test(value))
}

function sourceIconUrl(domain: string) {
  const cleanDomain = String(domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${cleanDomain}`)}&sz=64`
}

function SourceIcon({ source, className = "" }: { source: Pick<MalikWebSource, "domain" | "title">; className?: string }) {
  const [fallbackStep, setFallbackStep] = useState(0)
  const cleanDomain = (source.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
  const letter = (cleanDomain || source.title || "S").charAt(0).toUpperCase()
  const candidates = [
    sourceIconUrl(cleanDomain),
    cleanDomain ? `https://${cleanDomain}/favicon.ico` : "",
  ].filter(Boolean)
  return (
    <span className={cn("malik-source-icon", className)} aria-hidden="true">
      {fallbackStep >= candidates.length
        ? letter
        : <img src={candidates[fallbackStep]} alt="" onError={() => setFallbackStep((step) => step + 1)} />}
    </span>
  )
}

function sourceDisplayName(source: MalikWebSource) {
  const domain = String(source.domain || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase()

  const known: Record<string, string> = {
    "wikipedia.org": "Wikipedia",
    "en.wikipedia.org": "Wikipedia",
    "britannica.com": "Britannica",
    "millercenter.org": "Miller Center",
    "whitehousehistory.org": "White House Historical Association",
    "ballotpedia.org": "Ballotpedia",
    "bing.com": "Bing",
    "www2.bing.com": "Bing",
    "rewards.bing.com": "Microsoft Rewards",
    "github.com": "GitHub",
    "google.com": "Google",
    "youtube.com": "YouTube",
  }
  if (known[domain]) return known[domain]

  const parts = domain.split(".").filter(Boolean)
  const root = parts.length > 1 ? parts[parts.length - 2] : parts[0] || "Источник"
  return root
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function cleanResearchDisplayText(value: string, research?: MalikMessageResearch) {
  const text = cleanChatViewText(value)
  if (!research?.sources.length || !text) return text

  const markers = [...text.matchAll(/(?:^|\n)(?:#{1,3}\s*)?(?:sources|источники)\s*:?\s*/gim)]
  const marker = markers.at(-1)
  if (!marker || marker.index == null) return text

  const appendix = text.slice(marker.index)
  const isTrailingAppendix = marker.index > text.length * 0.45 || /https?:\/\/|\[[^\]]+\]\(/i.test(appendix)
  return isTrailingAppendix ? text.slice(0, marker.index).trim() : text
}

function ActivityIcon({ step }: { step: MalikResearchStep }) {
  if (step.domain) return <SourceIcon source={{ domain: step.domain, title: step.title || step.domain }} />
  if (step.kind === "search" || step.kind === "source") return <Search className="h-[13px] w-[13px]" />
  if (step.kind === "reading") return <BookOpen className="h-[13px] w-[13px]" />
  if (step.kind === "done") return <Check className="h-[13px] w-[13px]" />
  return <Lightbulb className="h-[13px] w-[13px]" />
}

function VideoAnalysisPulse({ compact = false }: { compact?: boolean }) {
  const stages = [
    "Разбираю сцены",
    "Сопоставляю движение",
    "Проверяю камеру и свет",
    "Ищу детали и артефакты",
    "Сверяю вывод",
  ] as const
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setStage((value) => (value + 1) % stages.length), 1350)
    return () => window.clearInterval(timer)
  }, [stages.length])

  if (compact) {
    return (
      <div className="malik-video-analysis-pulse mt-4 flex items-center gap-3 rounded-[16px] border border-white/[0.09] bg-[#080808] px-3.5 py-3" aria-live="polite">
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04]">
          <Video className="h-4 w-4 text-white" />
          <span className="absolute inset-[-3px] rounded-full border border-white/10 animate-ping" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[12px] font-semibold text-white">Malik Vision</strong>
          <span className="block truncate text-[11px] text-zinc-500">{stages[stage]}…</span>
        </span>
        <span className="flex shrink-0 gap-1" aria-hidden="true">
          {stages.map((_, index) => (
            <i
              key={index}
              className={cn(
                "h-1.5 w-4 rounded-full transition-all duration-500",
                index < stage ? "bg-white/45" : index === stage ? "bg-white" : "bg-white/10",
              )}
            />
          ))}
        </span>
      </div>
    )
  }

  return (
    <section className="malik-video-analysis-pulse w-full max-w-[620px] overflow-hidden rounded-[20px] border border-white/[0.09] bg-[#080808] p-4" aria-live="polite" aria-label="Глубокий анализ видео">
      <div className="flex items-center gap-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04]">
          <Video className="h-5 w-5 text-white" />
          <span className="absolute inset-[-4px] rounded-full border border-white/10 animate-ping" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[13px] font-semibold text-white">Malik Vision · глубокий анализ</strong>
          <span className="mt-0.5 block text-[11px] text-zinc-500">{stages[stage]}…</span>
        </span>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1.5" aria-hidden="true">
        {stages.map((label, index) => (
          <div key={label} className="min-w-0">
            <div className={cn(
              "h-1.5 overflow-hidden rounded-full bg-white/[0.07] transition-all duration-500",
              index === stage && "bg-white/[0.16]",
            )}>
              <span className={cn(
                "block h-full origin-left rounded-full bg-white transition-transform duration-700",
                index < stage ? "scale-x-100 opacity-45" : index === stage ? "scale-x-100 opacity-100 animate-pulse" : "scale-x-0 opacity-0",
              )} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex h-12 items-end gap-1 overflow-hidden rounded-[12px] border border-white/[0.06] bg-black px-2.5 py-2" aria-hidden="true">
        {Array.from({ length: 22 }).map((_, index) => {
          const active = index % stages.length === stage
          return (
            <span
              key={index}
              className={cn(
                "w-full rounded-full bg-white/[0.12] transition-all duration-500",
                active ? "h-8 bg-white/65 animate-pulse" : index % 3 === 0 ? "h-5" : index % 2 === 0 ? "h-3" : "h-4",
              )}
            />
          )
        })}
      </div>
    </section>
  )
}

function ThinkingBubble({
  generationType,
  query = "",
  research,
  videoAnalysis = false,
}: {
  generationType: GenerationStatusType
  query?: string
  research?: MalikMessageResearch
  videoAnalysis?: boolean
}) {
  const [elapsed, setElapsed] = useState(0)
  const isResearch = Boolean(research?.usedWeb || research?.steps.length || isWorldResearchPrompt(query))
  const steps = research?.steps || []
  const visibleSources = research?.sources.slice(0, 6) || []

  // Elapsed time is measured, not animated — the row at the end reports how long
  // the turn actually took.
  useEffect(() => {
    const startedAt = research?.startedAt || Date.now()
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [query, research?.startedAt])

  const labelMap: Record<GenerationStatusType, string> = {
    text: "Думаю",
    image: "Готовлю визуал",
    video: "Собираю видео",
    file: "Читаю файлы",
    code: "Планирую код",
    website: "Собираю интерфейс",
    codex: "Планирую файлы",
  }

  if (!isResearch) {
    if (videoAnalysis) return <VideoAnalysisPulse />
    return (
      <p className="malik-thinking-line" aria-live="polite">
        {labelMap[generationType] || labelMap.text}
        <span className="malik-thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
    )
  }

  return (
    <div className="malik-activity" aria-live="polite">
      {visibleSources.length ? (
        <div className="malik-live-source-icons" aria-label={`Найдено источников: ${visibleSources.length}`}>
          {visibleSources.map((source) => <SourceIcon key={source.url} source={source} />)}
          <span>Проверяю открытые источники</span>
        </div>
      ) : null}
      {(steps.length ? steps : [{ id: "search-start", kind: "search", text: "Ищу по открытому вебу", at: Date.now() } as MalikResearchStep]).slice(-7).map((row, index, rows) => (
        <div key={row.id} className={cn("malik-activity-row", index === rows.length - 1 && "is-current")}>
          <span className="malik-activity-icon" aria-hidden="true">
            <ActivityIcon step={row} />
          </span>
          <span className="malik-activity-text">{row.text}</span>
          {index === rows.length - 1 && research?.status !== "done" ? (
            <span className="malik-thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </div>
      ))}
      <div className="malik-activity-row is-meta">
        <span className="malik-activity-icon" aria-hidden="true">
          <Timer className="h-[13px] w-[13px]" />
        </span>
        <span className="malik-activity-text">Работа {elapsed}s</span>
      </div>
    </div>
  )
}

function SourceDrawer({ research, onClose }: { research: MalikMessageResearch; onClose: () => void }) {
  const visibleSteps = research.steps
    .filter((step, index, list) => list.findIndex((candidate) =>
      candidate.kind === step.kind && candidate.domain === step.domain && candidate.text === step.text
    ) === index)
    .slice(-12)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [onClose])

  return createPortal(
    <div className="malik-sources-drawer-layer">
      <button type="button" aria-label="Закрыть источники" className="malik-sources-drawer-backdrop" onClick={onClose} />
      <aside className="malik-sources-drawer" role="dialog" aria-modal="true" aria-label="Источники">
        <header className="malik-sources-drawer__header">
          <div>
            <h2>Источники</h2>
            <p>{research.sources.length} прочитано{research.tookMs ? ` · ${(research.tookMs / 1000).toFixed(1)}с` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </header>

        <div className="malik-sources-drawer__scroll">
          {visibleSteps.length ? (
            <section className="malik-sources-drawer__section" aria-label="Ход поиска">
              <h3>Ход поиска</h3>
              <div className="malik-sources-drawer__activity">
                {visibleSteps.map((step) => (
                  <div key={step.id} className="malik-sources-drawer__activity-row">
                    <span><ActivityIcon step={step} /></span>
                    <div>
                      <strong>{step.text}</strong>
                      {step.domain ? <small>{step.domain}</small> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="malik-sources-drawer__section" aria-label="Прочитанные страницы">
            <h3>Прочитанные страницы</h3>
            <div className="malik-sources-drawer__links">
              {research.sources.map((source, index) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  <SourceIcon source={source} />
                  <span>
                    <strong>{source.title || sourceDisplayName(source)}</strong>
                    <small>{source.domain}</small>
                  </span>
                  <em>{index + 1}</em>
                </a>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function SourceDeck({ research }: { research: MalikMessageResearch }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sources = research.sources
  if (!sources.length) return null

  const distinctSources = sources.filter((source, index, list) =>
    list.findIndex((candidate) => candidate.domain === source.domain) === index
  )
  const uniqueIconSources = distinctSources.slice(0, 4)

  return (
    <section className="malik-source-inline" aria-label="Источники ответа">
      <p className="malik-source-inline__links">
        <strong>Источники:</strong>{" "}
        {distinctSources.slice(0, 5).map((source, index) => (
          <React.Fragment key={source.url}>
            {index > 0 ? ", " : null}
            <a href={source.url} target="_blank" rel="noreferrer">{sourceDisplayName(source)}</a>
          </React.Fragment>
        ))}
        {distinctSources.length > 5 ? ` и ещё ${distinctSources.length - 5}` : null}.
      </p>
      <button type="button" onClick={() => setDrawerOpen(true)} className="malik-source-pill" aria-label={`Открыть ${sources.length} источников`}>
        <span className="malik-source-pill__icons">
          {uniqueIconSources.map((source) => <SourceIcon key={source.url} source={source} />)}
        </span>
        <span>sources</span>
      </button>
      {drawerOpen ? <SourceDrawer research={research} onClose={() => setDrawerOpen(false)} /> : null}
    </section>
  )
}

function MalikActionPlanCard({ plan, onOpenTarget }: { plan: MalikActionPlan; onOpenTarget?: (target: MalikActionTarget) => void }) {
  const [expanded, setExpanded] = useState(plan.status === "running")
  const completed = plan.steps.filter((step) => step.status === "done").length
  const statusLabel = plan.status === "running"
    ? "Выполняется"
    : plan.status === "awaiting-confirmation"
      ? "Ждёт подтверждения"
      : plan.status === "failed"
        ? "Остановлено"
        : plan.status === "completed"
          ? "Завершено"
          : "Готово к продолжению"

  return (
    <section className="mb-4 w-full max-w-[680px] overflow-hidden rounded-2xl border border-white/10 bg-[#090909] text-left shadow-[0_20px_70px_rgba(0,0,0,.28)]" aria-label="План Malik Action OS">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.035]"
        aria-expanded={expanded}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-black">
          {plan.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[13px] font-semibold text-white">{plan.title}</strong>
          <small className="block truncate text-[11px] text-zinc-500">{completed}/{plan.steps.length} выполнено · {statusLabel}</small>
        </span>
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-zinc-600 transition-transform", expanded && "rotate-90")} />
      </button>

      {expanded ? (
        <div className="border-t border-white/[0.07] px-4 py-3">
          <div className="space-y-1.5">
            {plan.steps.map((step, index) => (
              <div key={step.id} className="group flex min-h-10 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.025]">
                <span className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                  step.status === "done" && "border-white bg-white text-black",
                  step.status === "running" && "border-white/30 bg-white/[0.08] text-white",
                  step.status === "ready" && "border-white/20 bg-transparent text-zinc-300",
                  step.status === "blocked" && "border-red-400/25 bg-red-400/[0.06] text-red-300",
                  step.status === "queued" && "border-white/10 bg-transparent text-zinc-600",
                )}>
                  {step.status === "done" ? <Check className="h-3.5 w-3.5" /> : step.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-xs font-medium text-zinc-200">{step.title}</strong>
                  <small className="line-clamp-1 block text-[10px] leading-4 text-zinc-600">{step.detail}</small>
                </span>
                {step.target && step.status === "ready" ? (
                  <button
                    type="button"
                    onClick={() => onOpenTarget?.(step.target!)}
                    className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
                  >
                    Открыть
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {plan.receipt ? (
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                <span>Action receipt</span>
                <span>Внешних действий: {plan.receipt.externalActionsPerformed}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-zinc-400">{plan.receipt.note}</p>
            </div>
          ) : plan.requiresConfirmation ? (
            <p className="mt-3 text-[11px] leading-4 text-zinc-500">Платные и внешние действия не запускаются без вашего подтверждения.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function MessageBubble({
  message,
  onCopy,
  copied,
  generationType = "text",
  thinkingQuery = "",
  onRegenerate,
  onShare,
  onFeedback,
  feedback,
  onImageConfirmation,
  imageCredits,
  onOpenActionTarget,
  videoAnalysis = false,
}: {
  message: Message
  onCopy: (id: string, text: string) => void
  copied: boolean
  generationType?: GenerationStatusType
  
  thinkingQuery?: string
  onRegenerate?: (id: string) => void
  onShare?: (text: string) => void
  onFeedback?: (id: string, value: "up" | "down") => void
  feedback?: "up" | "down" | null
  onImageConfirmation?: (messageId: string, prompt: string, action: "confirm" | "cancel" | "generate", imageSize?: ImageResolution) => void
  imageCredits?: ImageCreditSnapshot | null
  onOpenActionTarget?: (target: MalikActionTarget) => void
  videoAnalysis?: boolean
}) {
  const isUser = message.role === "user"
  const isThinking = Boolean(message.isStreaming && !message.content && !message.generatedMedia)
  const displayContent = isUser ? message.content : cleanResearchDisplayText(message.content, message.research)
  const responseModel = !isUser && message.modelId ? getMalikModel(message.modelId) : null
  return (
    <div data-malik-message={message.role} className={cn("malik-message-row flex w-full gap-3 sm:gap-4", isUser ? "malik-message-row-user justify-end" : "malik-message-row-assistant justify-start")}>
      {/* The mark is a progress indicator, not a byline: it appears while the
          answer is being produced and leaves with the spinner. A finished
          answer stands on its own, the way every mainstream assistant shows
          one. */}
      {!isUser && message.isStreaming && (
        <div className="malik-ai-avatar is-working flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black">
          <svg viewBox="0 0 44 44" className="h-full w-full" aria-hidden="true"><rect width="44" height="44" rx="12" fill="white" /><path d="M9 29 L22 15 L22 29 Z" fill="#03040a" /><path d="M24 15 H38 L24 29 Z" fill="#03040a" /></svg>
        </div>
      )}
      <div className={cn("malik-message-stack min-w-0 overflow-hidden", isUser ? "order-first max-w-[92%] sm:max-w-[80%]" : "w-full")}>
        <div className={cn(
          "malik-message-card break-words text-[15px] leading-7 sm:text-[15.5px]",
          message.generatedMedia || message.imageConfirmation || isThinking
            ? "bg-transparent p-0"
            : isUser
              ? "malik-message-card-user whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-white sm:px-5 sm:py-4"
              // No whitespace-pre-wrap on the assistant side any more: its reply
              // is rendered as structured blocks, and pre-wrap would add the
              // source newlines on top of the spacing those blocks already have.
              : "malik-message-card-assistant text-[#e9e3d6]",
        )}>
          {responseModel && !message.generatedMedia && !message.imageConfirmation ? (
            <div className="malik-response-model" aria-label={`Ответ модели ${responseModel.label}`}>
              <span className="malik-response-model__mark" aria-hidden="true">
                <svg viewBox="0 0 44 44"><path d="M9 29 L22 15 L22 29 Z" fill="currentColor" /><path d="M24 15 H38 L24 29 Z" fill="currentColor" /></svg>
              </span>
              <span>{responseModel.label}</span>
            </div>
          ) : null}
          {!isUser && message.actionPlan ? <MalikActionPlanCard plan={message.actionPlan} onOpenTarget={onOpenActionTarget} /> : null}
          {isUser && message.attachments?.length ? <UserAttachmentGallery items={message.attachments} /> : null}
          {message.generatedMedia ? (
            <GeminiMediaGenerationCard media={message.generatedMedia} />
          ) : message.imageConfirmation ? (
            <section className="w-full max-w-[560px] rounded-[1.4rem] border border-white/10 bg-[#111112] p-4 shadow-[0_18px_60px_rgba(0,0,0,.32)] sm:p-5" aria-label="Подтверждение генерации изображения">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-black"><ImageIcon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-white">Создать изображение?</h3>
                  <p className="mt-1 line-clamp-3 text-sm leading-5 text-zinc-400">{message.imageConfirmation.prompt}</p>
                </div>
              </div>
              {message.imageConfirmation.status === "pending" ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <button
                    type="button"
                    onClick={() => onImageConfirmation?.(message.id, message.imageConfirmation!.prompt, "confirm")}
                    className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-zinc-200"
                  >
                    Да, создать изображение
                  </button>
                  <button
                    type="button"
                    onClick={() => onImageConfirmation?.(message.id, message.imageConfirmation!.prompt, "cancel")}
                    className="min-h-11 rounded-xl border border-white/10 px-5 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    Отмена
                  </button>
                </div>
              ) : message.imageConfirmation.status === "confirmed" ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Качество</span>
                    <span className="text-xs font-medium text-zinc-400">
                      Фото-кредиты: {imageCredits ? (imageCredits.remaining > 1_000_000 ? "∞" : imageCredits.remaining) : "…"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["1K", "2K", "4K"] as const).map((size) => {
                      const cost = imageCredits?.costs?.[size] ?? (size === "1K" ? 1 : size === "2K" ? 2 : 5)
                      const blockedByCredits = imageCredits ? imageCredits.remaining < cost : false
                      const blocked4k = size === "4K" && imageCredits ? imageCredits.remaining4k <= 0 : false
                      const disabled = blockedByCredits || blocked4k
                      return (
                        <button
                          key={size}
                          type="button"
                          disabled={disabled}
                          onClick={() => onImageConfirmation?.(message.id, message.imageConfirmation!.prompt, "generate", size)}
                          className={cn(
                            "min-h-12 rounded-xl border px-3 text-sm font-semibold transition",
                            disabled
                              ? "cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-zinc-700"
                              : "border-white/10 bg-white/[0.045] text-white hover:border-white/20 hover:bg-white/[0.08]",
                          )}
                          title={blocked4k ? "Лимит 4K на сегодня исчерпан" : blockedByCredits ? "Недостаточно фото-кредитов" : undefined}
                        >
                          <span className="block">{size}</span>
                          <span className="mt-0.5 block text-[10px] font-medium text-zinc-500">{cost} кр.</span>
                        </button>
                      )
                    })}
                  </div>
                  {imageCredits ? (
                    <p className="mt-2 text-[11px] text-zinc-600">
                      Доступно {imageCredits.remaining > 1_000_000 ? "∞" : imageCredits.remaining} из {imageCredits.daily > 1_000_000 ? "∞" : imageCredits.daily} · 4K: {imageCredits.remaining4k > 1_000_000 ? "∞" : imageCredits.remaining4k} осталось
                    </p>
                  ) : null}
                </div>
              ) : message.imageConfirmation.status === "generating" ? (
                <p className="mt-4 text-sm font-medium text-zinc-400">
                  Запускаю {message.imageConfirmation.imageSize || "выбранное"} качество…
                </p>
              ) : (
                <p className="mt-4 text-sm font-medium text-zinc-400">Генерация отменена.</p>
              )}
            </section>
          ) : displayContent
            ? (
              isUser
                ? displayContent
                : (
                  <>
                    <MalikMarkdown text={displayContent} />
                    {message.isStreaming && videoAnalysis ? <VideoAnalysisPulse compact /> : null}
                  </>
                )
            )
            : (message.isStreaming ? <ThinkingBubble generationType={generationType} query={thinkingQuery} research={message.research} videoAnalysis={videoAnalysis} /> : "")}
          {!isUser && !message.isStreaming && message.research?.sources.length ? (
            <SourceDeck research={message.research} />
          ) : null}
        </div>
        {!isUser && message.content && !message.isStreaming && !message.imageConfirmation && (
          <div className={cn("malik-message-actions mt-2 flex items-center gap-2 text-slate-500", Boolean(message.research?.sources.length) && "is-research")}>
            <button type="button" title="Копировать" onClick={() => onCopy(message.id, displayContent)} className="rounded-md p-1 hover:bg-white/10 hover:text-white">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
            <button type="button" title="Перегенерировать" onClick={() => onRegenerate?.(message.id)} className="rounded-md p-1 hover:bg-white/10 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
            <button type="button" title="Полезно" onClick={() => onFeedback?.(message.id, "up")} className={cn("rounded-md p-1 hover:bg-white/10 hover:text-white", feedback === "up" && "text-emerald-300")}><ThumbsUp className="h-4 w-4" /></button>
            <button type="button" title="Не полезно" onClick={() => onFeedback?.(message.id, "down")} className={cn("rounded-md p-1 hover:bg-white/10 hover:text-white", feedback === "down" && "text-amber-300")}><ThumbsDown className="h-4 w-4" /></button>
            <button type="button" title="Поделиться" onClick={() => onShare?.(displayContent)} className="rounded-md p-1 hover:bg-white/10 hover:text-white"><Share className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      {/* No initials disc beside the user's own turn either — the bubble and
          its right alignment already say who wrote it. */}
    </div>
  )
}

export function ChatView({ messages, onSendMessage, onImageConfirmation, isLoading, currentUser = "User", userPlan = "free", selectedModelId = DEFAULT_MALIK_MODEL_ID, onModelChange, onOpenBilling, onOpenPlugins, onOpenCodex, onForceCanvas, onOpenVoice, onOpenActionTarget, projectName, projectDescription }: ChatViewProps) {
  // One short pulse after the complete answer lands. Passing a number (rather
  // than a pattern) deliberately keeps this to a single haptic event.
  const wasLoading = useRef(false)
  useEffect(() => {
    if (wasLoading.current && !isLoading && document.visibilityState === "visible") {
      try {
        navigator.vibrate?.(20)
      } catch {
        /* unsupported or blocked */
      }
    }
    wasLoading.current = Boolean(isLoading)
  }, [isLoading])

  const [prompt, setPrompt] = useState("")
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState("")
  const [effectivePlan, setEffectivePlan] = useState<AIPlan>(userPlan)
  const [responseDepth, setResponseDepth] = useState<ResponseDepth>(() => loadResponseDepth(userPlan))
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down">>({})
  const [imageCredits, setImageCredits] = useState<ImageCreditSnapshot | null>(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  useEffect(() => {
    let cancelled = false

    const refreshImageCredits = async () => {
      try {
        const response = await fetch("/api/ai/image/credits", { cache: "no-store", credentials: "same-origin" })
        const payload = await response.json().catch(() => null)
        if (!cancelled && response.ok && payload?.ok) {
          setImageCredits({
            remaining: Number(payload.remaining || 0),
            daily: Number(payload.daily || 0),
            used: Number(payload.used || 0),
            costs: {
              "1K": Number(payload?.costs?.["1K"] ?? 1),
              "2K": Number(payload?.costs?.["2K"] ?? 2),
              "4K": Number(payload?.costs?.["4K"] ?? 5),
            },
            max4kPerDay: Number(payload.max4kPerDay || 0),
            used4k: Number(payload.used4k || 0),
            remaining4k: Number(payload.remaining4k || 0),
            resetAt: typeof payload.resetAt === "string" ? payload.resetAt : undefined,
          })
        }
      } catch {
        // Credits stay server-authoritative; a temporary badge refresh failure
        // must never break the chat itself.
      }
    }

    const refresh = () => { void refreshImageCredits() }
    const onVisibility = () => { if (document.visibilityState === "visible") refresh() }

    refresh()
    window.addEventListener("malik-image-credits-changed", refresh)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      window.removeEventListener("malik-image-credits-changed", refresh)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const [attachMenuPosition, setAttachMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const [dragActive, setDragActive] = useState(false)
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
  const videoInputRef = useRef<HTMLInputElement>(null)
  const attachButtonRef = useRef<HTMLButtonElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      return
    }
    // Scroll the thread only. scrollIntoView can also pan Safari's document
    // while the keyboard is up, pulling the header and composer off screen.
    const thread = messagesEndRef.current?.closest<HTMLElement>(".malik-chat-scroll")
    thread?.scrollTo({ top: thread.scrollHeight, behavior: "smooth" })
  }, [messages])
  useEffect(() => {
    setEffectivePlan(userPlan)
    if (!currentUser || currentUser === "User") return
    clientFetchWithTimeout(`/api/ai/usage?userId=${encodeURIComponent(currentUser)}`, { cache: "no-store" })
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
    const current = new URL(window.location.href)
    const token = current.searchParams.get("shareTarget")
    if (!token) return
    let cancelled = false

    fetch(`/api/attachments/share-target?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
      .then(({ response, payload }) => {
        if (cancelled || !response.ok || !payload?.ok) return
        const imported = (Array.isArray(payload.files) ? payload.files : [])
          .map(attachmentFromSharedFile)
          .filter((item: ChatAttachment | null): item is ChatAttachment => Boolean(item))
        if (imported.length) setAttachments((previous) => [...previous, ...imported].slice(0, 8))
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
  useEffect(() => {
    if (!textareaRef.current) return
    const priority = window.matchMedia("(max-width: 767px)").matches ? "important" : ""
    textareaRef.current.style.setProperty("height", "auto", priority)
    textareaRef.current.style.setProperty("height", `${Math.min(textareaRef.current.scrollHeight, 160)}px`, priority)
  }, [prompt])
  useEffect(() => {
    if (!showAttachMenu) return
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (attachButtonRef.current?.contains(target) || attachMenuRef.current?.contains(target)) return
      setShowAttachMenu(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAttachMenu(false)
    }
    document.addEventListener("pointerdown", closeOnPointerDown)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [showAttachMenu])

  useEffect(() => {
    if (!showAttachMenu) {
      setAttachMenuPosition(null)
      return
    }

    const updatePosition = () => {
      const button = attachButtonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const width = Math.min(340, Math.max(248, window.innerWidth - 24))
      const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12))
      setAttachMenuPosition({ left, top: Math.max(12, rect.top - 12), width })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [showAttachMenu])


  const lastUserPrompt = useMemo(() => lastSubmittedPrompt || [...messages].reverse().find((message) => message.role === "user")?.content || prompt, [lastSubmittedPrompt, messages, prompt])

  const activeGenerationType = useMemo(() => {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")
    const lastAttachments = lastUserMessage?.attachments || []
    if (lastAttachments.some((item) => item.kind === "video" || item.mime?.startsWith("video/"))) return "video"
    if (lastAttachments.some((item) => item.kind === "image" || item.mime?.startsWith("image/"))) return "image"
    if (lastAttachments.some((item) => ["file", "code"].includes(item.kind))) return "file"
    return detectGenerationStatusType(lastUserMessage?.content || prompt)
  }, [messages, prompt])

  const activeVideoAnalysis = useMemo(() => {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")
    return Boolean(lastUserMessage?.attachments?.some((item) => item.kind === "video" || item.mime?.startsWith("video/")))
  }, [messages])

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    setLocalError(null)
    try {
      const parsed = await Promise.all(Array.from(files).slice(0, 8).map(fileToAttachment))
      setAttachments((previous) => [...previous, ...parsed].slice(0, 8))
      setShowAttachMenu(false)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Ошибка файла")
    }
  }

  const importRemoteMedia = async (rawUrl: string) => {
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
      if (!response.ok || !payload?.ok || !payload?.file?.base64) {
        throw new Error(payload?.error || "Не удалось загрузить медиа по ссылке")
      }

      const binary = atob(String(payload.file.base64))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const mime = String(payload.file.mime || "application/octet-stream")
      const blob = new Blob([bytes], { type: mime })
      const attachment: ChatAttachment = {
        id: crypto.randomUUID(),
        name: String(payload.file.name || "shared-media"),
        mime,
        size: Number(payload.file.size || blob.size),
        kind: mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "file",
        base64: String(payload.file.base64),
        url: URL.createObjectURL(blob),
      }
      setAttachments((previous) => [...previous, attachment].slice(0, 8))
      setLocalError(null)
      return true
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Не удалось импортировать медиа")
      return false
    }
  }

  const externalUrlFromTransfer = (transfer: DataTransfer | null) => {
    if (!transfer) return ""
    const uri = transfer.getData("text/uri-list").split(/\r?\n/).find((line) => line && !line.startsWith("#")) || ""
    if (/^https?:\/\//i.test(uri.trim())) return uri.trim()
    const html = transfer.getData("text/html")
    const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (srcMatch?.[1] && /^https?:\/\//i.test(srcMatch[1])) return srcMatch[1]
    const text = transfer.getData("text/plain").trim()
    return /^https?:\/\/\S+$/i.test(text) ? text : ""
  }

  const handleComposerPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files || [])
    if (files.length) {
      event.preventDefault()
      await handleFiles(files)
      return
    }
    const url = externalUrlFromTransfer(event.clipboardData)
    if (url) {
      event.preventDefault()
      await importRemoteMedia(url)
    }
  }

  const handleComposerDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const files = Array.from(event.dataTransfer.files || [])
    if (files.length) {
      await handleFiles(files)
      return
    }
    const url = externalUrlFromTransfer(event.dataTransfer)
    if (url) await importRemoteMedia(url)
  }

  const removeComposerAttachment = (id: string) => {
    setAttachments((previous) => {
      const target = previous.find((item) => item.id === id)
      if (target?.url?.startsWith("blob:")) URL.revokeObjectURL(target.url)
      return previous.filter((item) => item.id !== id)
    })
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
    const rawText = prompt.trim()
    if (!rawText && attachments.length === 0) return
    if (isLoading) {
      setLocalError("Malik AI уже обрабатывает запрос.")
      return
    }

    // The message is sent exactly as the user wrote it. Media generation is gated
    // by the slash-command check in the dashboard and by the server-side cost
    // guard; prefixing every prompt with a "TEXT ONLY" instruction used to leak
    // into chat titles and history, and the words "image/photo/video" inside
    // that instruction were themselves matching the old media detector.
    const outgoing = rawText || "Проанализируй вложения"
    const hasImageAttachment = attachments.some((item) => item.kind === "image")
    const imageEditRequest = hasImageAttachment && isExplicitImageEditRequest(outgoing, true)
    // Hard routing guard: an uploaded-image edit must never fall through to the
    // text model. The slash command is internal; dashboard strips it from the
    // visible user message and uses the uploaded pixels as the edit reference.
    const routedOutgoing = imageEditRequest && !/^\s*\/(?:image|img|photo|foto|фото|картинка)\b/iu.test(outgoing)
      ? `/image ${outgoing}`
      : outgoing

    setLocalError(null)
    try { window.localStorage.setItem("malik_last_user_prompt", outgoing) } catch {}
    setLastSubmittedPrompt(outgoing)
    onSendMessage(routedOutgoing, attachments, { responseDepth })
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
    {
      label: "Загрузить изображения",
      icon: ImageIcon,
      action: () => { setShowAttachMenu(false); imageInputRef.current?.click() },
    },
    {
      label: "Загрузить видео",
      icon: Video,
      action: () => { setShowAttachMenu(false); videoInputRef.current?.click() },
    },
    {
      label: "Загрузить файлы",
      icon: Paperclip,
      action: () => { setShowAttachMenu(false); fileInputRef.current?.click() },
    },
  ], [])

  return (
    <div data-malik-chat-fullwidth="1" className="malik-chat-fullwidth relative z-[2] flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-transparent text-white">
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
      {/* No gradient wash, 44px grid or horizon glow behind the thread. Three
          stacked decorative layers are what made the surface read as panels
          with seams instead of one continuous background. */}

      <div data-message-list className="malik-chat-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-44 pt-6 md:px-8 md:pb-48 lg:px-10">
        <div className="malik-message-list mx-auto flex w-full max-w-[768px] flex-col gap-8 sm:gap-10">
          {messages.length === 0 ? (
            projectName ? (
              <div className="mx-auto mt-12 w-full max-w-2xl px-2 text-center sm:mt-20">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
                  <FolderTree className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-white">Начните работу над «{projectName}»</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">{projectDescription || "Инструкции и выбранная Malik-модель уже привязаны к этому проекту."}</p>
                <div className="mt-7 grid gap-2 text-left sm:grid-cols-2">
                  {[
                    "Составь план проекта по шагам",
                    "Предложи production-ready архитектуру",
                    "Определи риски и следующие действия",
                    "Начни реализацию основной функции",
                  ].map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => handleQuickAction(suggestion)} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs leading-5 text-zinc-400 transition hover:border-white/[0.15] hover:bg-white/[0.05] hover:text-white">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="relative mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 text-center shadow-[0_30px_90px_rgba(0,0,0,.38)] backdrop-blur-xl sm:mt-16 sm:p-10">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(228, 187, 94,.15),transparent_35%),radial-gradient(circle_at_78%_75%,rgba(217, 174, 69,.16),transparent_36%)]" />
                <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_0_60px_rgba(255,255,255,.16)]">
                  <svg viewBox="0 0 44 44" className="h-full w-full" aria-hidden="true"><rect width="44" height="44" rx="12" fill="white" /><path d="M9 29 L22 15 L22 29 Z" fill="#03040a" /><path d="M24 15 H38 L24 29 Z" fill="#03040a" /></svg>
                </div>
                <h2 className="relative text-3xl font-black tracking-tight">Malik AI Max</h2>
                <p className="relative mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Чат, код, canvas, файлы, голос, Codex және фото/видео generation — бәрі бір prompt ішінде.</p>
              </div>
            )
          ) : (
            <>
              <div className="malik-date-chip">Сегодня</div>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onCopy={handleCopy}
                  copied={copiedId === message.id}
                  generationType={activeGenerationType}
                  thinkingQuery={lastUserPrompt}
                  onRegenerate={handleRegenerate}
                  onShare={handleShare}
                  onFeedback={handleFeedback}
                  feedback={feedbackMap[message.id] ?? null}
                  onImageConfirmation={onImageConfirmation}
                  imageCredits={imageCredits}
                  onOpenActionTarget={onOpenActionTarget}
                  videoAnalysis={activeVideoAnalysis}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div data-composer className="malik-composer-dock relative z-20 w-full shrink-0 bg-transparent px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 md:px-8 md:pb-6 lg:px-10">
        <div
          className={cn("malik-composer-panel chat-composer relative mx-auto w-full max-w-[768px] rounded-[1.55rem] border border-white/10 bg-[#111112] p-3 transition sm:p-4", dragActive && "ring-2 ring-white/35")}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
          onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
          }}
          onDrop={handleComposerDrop}
        >
          {localError && <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">{localError}</div>}
          {attachments.length > 0 && <div className="malik-composer-attachments mb-3 flex max-w-full flex-wrap gap-2">{attachments.map((attachment) => <AttachmentPill key={attachment.id} item={attachment} onRemove={() => removeComposerAttachment(attachment.id)} />)}</div>}
          {dragActive ? <div className="pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-[20px] border border-dashed border-white/30 bg-black/70 text-sm font-medium text-white">Отпустите фото, видео или файл</div> : null}
          <div className="malik-inline-composer">
            <button ref={attachButtonRef} type="button" onClick={() => setShowAttachMenu((value) => !value)} className={cn("malik-inline-action", showAttachMenu && "is-active")} aria-label="Добавить" aria-haspopup="menu" aria-expanded={showAttachMenu} aria-controls="malik-attachment-menu">
              <Plus className="h-5 w-5" />
            </button>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onPaste={handleComposerPaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  handleGuardedSubmit()
                }
              }}
              placeholder="Чем я могу помочь сегодня?"
              className="malik-composer-textarea"
            />
            <div className="malik-inline-composer__right">
              <MalikModelSelector
                selectedModelId={selectedModelId}
                plan={effectivePlan}
                onSelect={onModelChange || (() => {})}
                onOpenBilling={onOpenBilling}
                placement="top"
              />
              <span className="malik-inline-action-swap">
                <button
                  type="button"
                  onClick={onOpenVoice}
                  disabled={isLoading}
                  className={cn("malik-voice-entry", prompt.trim() && "is-hidden")}
                  aria-label="Открыть голосовой режим"
                  aria-hidden={Boolean(prompt.trim())}
                  tabIndex={prompt.trim() ? -1 : 0}
                >
                  <VoiceWaveIcon />
                </button>
                <button
                  type="button"
                  onClick={handleGuardedSubmit}
                  disabled={isLoading || (!prompt.trim() && attachments.length === 0)}
                  className={cn("malik-inline-send", !prompt.trim() && "is-hidden")}
                  aria-label={isLoading ? "Malik AI отвечает" : "Отправить"}
                  aria-hidden={!prompt.trim()}
                  tabIndex={prompt.trim() ? 0 : -1}
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
                </button>
              </span>
            </div>
          </div>
          <div className="malik-composer-context-row">
            <button type="button" onClick={() => handleQuickAction("Найди в открытом вебе свежую информацию и покажи источники")}>
              <Globe className="h-3.5 w-3.5" /> Веб и источники
            </button>
            <span>
              Фото · {imageCredits ? (imageCredits.remaining > 1_000_000 ? "∞" : imageCredits.remaining) : "…"} кр. · Enter — отправить · Shift + Enter — новая строка
            </span>
          </div>
          {showAttachMenu && attachMenuPosition && typeof document !== "undefined" ? createPortal(
            <div
              id="malik-attachment-menu"
              ref={attachMenuRef}
              role="menu"
              aria-label="Добавить в чат"
              className="fixed z-[10000] overflow-hidden rounded-[22px] border border-white/[0.10] bg-[#1b1b1c]/98 p-2 shadow-[0_24px_80px_rgba(0,0,0,.78)] backdrop-blur-xl"
              style={{
                left: attachMenuPosition.left,
                top: attachMenuPosition.top,
                width: attachMenuPosition.width,
                transform: "translateY(-100%)",
              }}
            >
              <div className="flex flex-col gap-1">
                {attachItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={item.action}
                    className="group flex min-h-12 w-full items-center gap-3 rounded-[15px] px-3 py-2.5 text-left text-[14px] font-semibold text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.11]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.10] text-white">
                      <item.icon className="h-5 w-5 stroke-[1.8]" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          ) : null}
        </div>
        <p className="mt-2 hidden text-center text-xs text-slate-600 sm:block">Malik AI может ошибаться. Проверяйте важную информацию.</p>
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (event) => { await handleFiles(event.target.files); event.currentTarget.value = "" }} />
      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={async (event) => { await handleFiles(event.target.files); event.currentTarget.value = "" }} />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.mdx,.csv,.tsv,.json,.jsonl,.yaml,.yml,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.java,.kt,.go,.rs,.rb,.php,.swift,.c,.h,.cpp,.hpp,.cs,.sql,.sh,.bash,.zsh,.ps1,.toml,.ini,.log"
        className="hidden"
        onChange={async (event) => { await handleFiles(event.target.files); event.currentTarget.value = "" }}
      />

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

