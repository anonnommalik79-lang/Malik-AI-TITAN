"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { createPortal } from "react-dom"
import { MalikMarkdown } from "./MalikMarkdown"
import { MalikTapGuide } from "./MalikTapGuide"
import type { SuperflowRef } from "./os/os-client"
import { AnswerDownloadButton, FollowUpChips, ReadAloudButton, ThoughtTrace, UserMessageActions, VersionPager, useChatShortcuts, type FollowUpSendOptions } from "./chat-extras"
import "./chat-live.css"

// The live Superflow block loads only when a conversation has one.
const SuperflowBlock = dynamic(() => import("./os/SuperflowBlock").then((mod) => mod.SuperflowBlock), { ssr: false, loading: () => null })
import {
  ArrowDown,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Code,
  Copy,
  FilePlus2,
  FileSearch,
  FileText,
  FolderTree,
  Github,
  Globe,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Lightbulb,
  Mail,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Square,
  Share,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Timer,
  TriangleAlert,
  Video,
  Volume2,
  Wand2,
  X,
  Loader2,
} from "lucide-react"
import type { GenerationStatusType } from "./generation-status"
import type { AIPlan } from "@/lib/ai/types"
import type { MalikMessageResearch, MalikResearchStep, MalikWebSource } from "@/lib/ai/web-research-types"
import type { MalikFactAudit, MalikFactClaim } from "@/lib/ai/fact-audit"
import { DEFAULT_MALIK_MODEL_ID, getMalikModel, type MalikModelId } from "@/lib/ai/malik-models"
import { clientFetchWithTimeout } from "@/lib/api-client"
import { MalikModelSelector } from "./MalikModelSelector"
import { canUseUltra, loadResponseDepth, type ChatSendOptions, type ResponseDepth } from "@/lib/ai/response-depth"
import { VoiceWaveIcon } from "@/components/voice/VoiceWaveIcon"
import { isExplicitImageEditRequest, isExplicitImageGenerationRequest } from "@/lib/ai/image-intent"
import { isDataSvgUrl, isImageLikeUrl, isRealVideoUrl } from "@/lib/media/media-url"
import { normalizeClientImage } from "@/lib/media/client-image-normalize"
import { isStoredGeneratedImageUrl, resolveGeneratedImageUrl } from "@/lib/media/client-generated-image-store"
import { queueMalikImageLineage } from "@/lib/media/image-history"
import { MALIK_IMAGE_EDITOR_REQUEST_EVENT, type MalikImageEditorRequest } from "@/lib/media/image-editor-events"
import { ImageGenerationMotion } from "./image-generation-motion"
import type { MalikActionPlan, MalikActionTarget } from "@/lib/ai/action-os"
import { ChatImageCreator } from "./ChatImageCreator"
import { ChatDrawingPad } from "./ChatDrawingPad"
import { ChatLibraryPicker } from "./ChatLibraryPicker"
import { ChatToolWorkspace, type ChatToolWorkspaceMode } from "./ChatToolWorkspace"
import { PREFILL_EVENT, takePrefillPrompt } from "@/lib/malik-context"
import { AnswerSheet } from "./answer-sheet/AnswerSheet"
import { ChatExecution } from "./ChatExecution"
import type { ExecutionTrace } from "@/lib/ai/chat-execution"
import { isSheetRequest } from "@/lib/ai/answer-sheet"
import type { WorkspaceMode } from "@/lib/ai/work-mode"
import { openOs } from "./os/os-client"
import { WorkStartPanel } from "./WorkStartPanel"

export type { ChatSendOptions }

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ")

const MALIK_CHATVIEW_SAFE_TEXT = ""
const MAX_CHAT_ATTACHMENTS = 12

function isChatViewBadText(value: string) {
  const text = String(value || "")
  const prose = text.replace(/```[\s\S]*?(?:```|$)/g, "")
  const commaCount = (prose.match(/,/g) || []).length
  // Spam means commas (or "per-" fragments) with almost no words between
  // them. A normal detailed answer has 25+ commas; an absolute limit made it
  // vanish — while streaming it even flipped back to the thinking indicator.
  const wordCount = (prose.match(/[\p{L}\p{N}]+/gu) || []).length
  const commaSpam = commaCount >= 25 && commaCount > wordCount * 0.6
  const perSpamCount = (prose.match(/\bper[-\w]*/gi) || []).length
  const perSpam = perSpamCount >= 5 && perSpamCount > wordCount * 0.2
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
    commaSpam ||
    perSpam
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
  /** Latest server status while the answer is being prepared. */
  liveStatus?: string
  execution?: ExecutionTrace
  /** A Superflow started by this turn. */
  superflow?: SuperflowRef
  /** How long the turn took before its first word, with the reported steps. */
  thought?: { ms: number; steps: string[] }
  /** Earlier answers to the same question (regenerated in place). */
  versions?: Array<{ content: string; at: number }>
}

type ImageResolution = "1K" | "2K" | "4K"

function formatImageCreditCount(value: number) {
  const count = Math.max(0, Math.trunc(Number(value) || 0))
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} кредит`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} кредита`
  return `${count} кредитов`
}

function formatImageCreditBalance(value: number) {
  return value > 1_000_000 ? "∞ кредитов" : formatImageCreditCount(value)
}

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
  /** Cached first frame for an uploaded video; not the full video bytes. */
  posterUrl?: string
  durationSeconds?: number
  analysisFrames?: Array<{
    name: string
    mime: "image/jpeg"
    base64: string
    timestampSeconds: number
  }>
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
  /** Provider-direct images exist only for the current browser session. */
  ephemeral?: boolean
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
  workspaceMode?: WorkspaceMode
  messages: Message[]
  onSendMessage: (message: string, attachments?: ChatAttachment[], options?: ChatSendOptions) => void
  onImageConfirmation?: (messageId: string, prompt: string, action: "confirm" | "cancel" | "generate", imageSize?: ImageResolution) => void
  isLoading?: boolean
  /** True only while the current text stream has a live AbortController. */
  canStopGeneration?: boolean
  onStopGeneration?: () => void
  streamingText?: string
  currentUser?: string
  userPlan?: AIPlan
  selectedModelId?: MalikModelId
  onModelChange?: (modelId: MalikModelId) => void
  onOpenBilling?: () => void
  onOpenPlugins?: () => void
  onOpenProjects?: () => void
  onNewTask?: () => void
  onOpenCodex?: () => void
  onForceCanvas?: () => void
  onOpenVoice?: () => void
  onOpenActionTarget?: (target: MalikActionTarget) => void
  projectName?: string
  projectDescription?: string
}

const MAX_BINARY_FILE_SIZE = 10 * 1024 * 1024
const MAX_VIDEO_FILE_SIZE = 150 * 1024 * 1024
const MAX_VIDEO_DURATION_SECONDS = 10
const VIDEO_ANALYSIS_FRAME_COUNT = 6
const VIDEO_ANALYSIS_LONG_EDGE = 640
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
  if (ext === "mp4" || ext === "m4v") return "video/mp4"
  if (ext === "mov") return "video/quicktime"
  if (ext === "webm") return "video/webm"
  if (TEXT_UPLOAD_EXTENSIONS.has(ext)) return "text/plain"
  return "application/octet-stream"
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "loadeddata" | "seeked",
  timeoutMs = 12_000,
) {
  return new Promise<void>((resolve, reject) => {
    let timer = 0
    const cleanup = () => {
      video.removeEventListener(eventName, onReady)
      video.removeEventListener("error", onError)
      if (timer) window.clearTimeout(timer)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error("Не удалось прочитать видео. Попробуйте MP4/MOV до 10 секунд."))
    }
    video.addEventListener(eventName, onReady, { once: true })
    video.addEventListener("error", onError, { once: true })
    timer = window.setTimeout(() => {
      cleanup()
      reject(new Error("Видео читается слишком долго. Попробуйте более короткий ролик."))
    }, timeoutMs)
  })
}

async function captureVideoAnalysisFrames(file: File) {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.preload = "auto"
  video.muted = true
  video.playsInline = true
  video.src = objectUrl

  try {
    await waitForVideoEvent(video, "loadedmetadata")

    const duration = Number(video.duration)
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Не удалось определить длительность видео.")
    }
    if (duration > MAX_VIDEO_DURATION_SECONDS + 0.15) {
      throw new Error(
        `Видео должно быть не длиннее ${MAX_VIDEO_DURATION_SECONDS} секунд. Сейчас: ${duration.toFixed(1)} сек.`,
      )
    }

    if (video.readyState < 2) {
      await waitForVideoEvent(video, "loadeddata")
    }

    const sourceWidth = Math.max(1, video.videoWidth || 1)
    const sourceHeight = Math.max(1, video.videoHeight || 1)
    const scale = Math.min(1, VIDEO_ANALYSIS_LONG_EDGE / Math.max(sourceWidth, sourceHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(2, Math.round(sourceWidth * scale))
    canvas.height = Math.max(2, Math.round(sourceHeight * scale))
    const context = canvas.getContext("2d", { alpha: false })
    if (!context) throw new Error("Браузер не смог подготовить кадры видео.")

    const frameCount = duration < 0.8 ? 4 : VIDEO_ANALYSIS_FRAME_COUNT
    const safeEnd = Math.max(0, duration - 0.03)
    const timestamps = Array.from(
      { length: frameCount },
      (_, index) => safeEnd * (index / (frameCount - 1)),
    )

    const frames: NonNullable<ChatAttachment["analysisFrames"]> = []
    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = timestamps[index]
      if (timestamp > 0.015 || Math.abs(video.currentTime - timestamp) > 0.04) {
        const seeked = waitForVideoEvent(video, "seeked", 10_000)
        video.currentTime = Math.min(safeEnd, Math.max(0, timestamp))
        await seeked
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72)
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] || "" : ""
      if (!base64) continue

      frames.push({
        name: `${file.name || "video"}-frame-${String(index + 1).padStart(2, "0")}.jpg`,
        mime: "image/jpeg",
        base64,
        timestampSeconds: Number(timestamp.toFixed(2)),
      })
    }

    if (frames.length < 2) {
      throw new Error("Не удалось извлечь достаточно кадров из видео.")
    }

    return {
      durationSeconds: Number(duration.toFixed(2)),
      frames,
    }
  } finally {
    video.pause()
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const mime = inferUploadMime(file)
  const ext = uploadExtension(file.name)
  const textLike = mime.startsWith("text/") || mime === "application/json" || TEXT_UPLOAD_EXTENSIONS.has(ext)

  if (mime.startsWith("video/")) {
    if (file.size > MAX_VIDEO_FILE_SIZE) {
      throw new Error(`Видео слишком большое: ${file.name}. Для анализа до 10 секунд лимит файла 150MB.`)
    }
    const analyzed = await captureVideoAnalysisFrames(file)
    return {
      id: crypto.randomUUID(),
      name: file.name,
      mime,
      size: file.size,
      kind: "video",
      url: URL.createObjectURL(file),
      durationSeconds: analyzed.durationSeconds,
      analysisFrames: analyzed.frames,
    }
  }

  if (mime.startsWith("image/")) {
    const normalized = await normalizeClientImage(file)
    return {
      id: crypto.randomUUID(),
      name: normalized.name,
      mime: normalized.mime,
      size: normalized.size,
      kind: "image",
      base64: normalized.base64,
      url: normalized.previewUrl,
    }
  }

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
    url: kind === "image" ? URL.createObjectURL(file) : undefined,
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
  if (typeof item.url === "string" && /^(?:blob:|data:(?:image|video)\/|https?:\/\/|\/(?!\/))/i.test(item.url)) return item.url
  if (item.base64 && (item.kind === "image" || item.kind === "video")) {
    return `data:${item.mime || (item.kind === "image" ? "image/jpeg" : "video/mp4")};base64,${item.base64}`
  }
  return ""
}

function AttachmentPill({ item, onRemove }: { item: ChatAttachment; onRemove: () => void }) {
  const preview = attachmentPreviewSrc(item)
  if (item.kind === "image" || item.kind === "video") {
    return (
      <div className="malik-composer-attachment-preview group relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[16px] border border-white/10 bg-black">
        {preview ? (item.kind === "image" ? (
          <img src={preview} alt={item.name || "Изображение"} className="h-full w-full object-cover" />
        ) : (
          <video src={preview} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        )) : (
          <span className="grid h-full w-full place-items-center text-white/65" title={item.name}>
            {item.kind === "image" ? <ImageIcon className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </span>
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
    <div className="group flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-zinc-300">
      <Icon className="h-4 w-4 shrink-0 text-zinc-300" />
      <span className="truncate">{item.name || item.url}</span>
      <button type="button" onClick={onRemove} className="ml-1 rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-white">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// Resolve short account-scoped browser media keys in the mounted card only.
// Revoke temporary object URLs when the card unmounts or changes reference.
function useStoredAttachmentUrl(reference?: string) {
  const [resolved, setResolved] = useState<{ key: string; url: string }>({ key: "", url: "" })
  useEffect(() => {
    if (!reference || !isStoredGeneratedImageUrl(reference)) return
    let active = true
    let objectUrl = ""
    void resolveGeneratedImageUrl(reference).then((url) => {
      if (!active) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url)
        return
      }
      objectUrl = url
      setResolved({ key: reference, url })
    }).catch(() => {
      if (active) setResolved({ key: reference, url: "" })
    })
    return () => {
      active = false
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl)
    }
  }, [reference])
  return isStoredGeneratedImageUrl(reference)
    ? (resolved.key === reference ? resolved.url : "")
    : reference || ""
}

function UserAttachmentPreview({ item }: { item: ChatAttachment }) {
  const [previewFailed, setPreviewFailed] = useState(false)
  const resolvedSource = useStoredAttachmentUrl(item.url)
  const posterSrc = useStoredAttachmentUrl(item.posterUrl)
  const src = isStoredGeneratedImageUrl(item.url) ? resolvedSource : attachmentPreviewSrc(item)
  const isImage = item.kind === "image" || item.mime?.startsWith("image/")
  const isVideo = item.kind === "video" || item.mime?.startsWith("video/")
  useEffect(() => { setPreviewFailed(false) }, [src])
  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return ""
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  }

  // Old missing URLs never convert a photo/video into a document pill.
  if (isImage) {
    return (
      <figure title={item.name} className="malik-user-attachment malik-user-attachment--image h-[152px] w-[152px] shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-black sm:h-[168px] sm:w-[168px]">
        {src && !previewFailed ? (
          <img src={src} alt={item.name || "Прикреплённое изображение"} className="block h-full w-full object-cover" loading="eager" onError={() => setPreviewFailed(true)} />
        ) : (
          <span className="grid h-full w-full place-items-center text-white/60" role="img" aria-label="Превью изображения недоступно"><ImageIcon className="h-7 w-7" /></span>
        )}
      </figure>
    )
  }

  if (isVideo) {
    return (
      <figure title={item.name} className="malik-user-attachment malik-user-attachment--video relative h-[152px] w-[152px] shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-black sm:h-[168px] sm:w-[168px]">
        {src && !previewFailed ? (
          <video src={src} poster={posterSrc || undefined} className="block h-full w-full bg-black object-cover" controls playsInline preload="metadata" onError={() => setPreviewFailed(true)} />
        ) : posterSrc ? (
          <>
            <img src={posterSrc} alt="Кадр прикреплённого видео" className="block h-full w-full object-cover" />
            <span className="pointer-events-none absolute inset-0 grid place-items-center text-white" aria-label="Превью видео"><span className="grid h-10 w-10 place-items-center rounded-full border border-white/50 bg-black/70"><Video className="h-5 w-5" /></span></span>
          </>
        ) : (
          <span className="grid h-full w-full place-items-center text-white/60" role="img" aria-label="Превью видео недоступно"><Video className="h-7 w-7" /></span>
        )}
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
        ephemeral={liveMedia.ephemeral}
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
            <a href={url} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-zinc-200">Открыть результат</a>
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
  liveStatus = "",
}: {
  generationType: GenerationStatusType
  query?: string
  research?: MalikMessageResearch
  videoAnalysis?: boolean
  /** Latest server status ("Думает…", "Пишет ответ…"); plain chat shows it without a timer. */
  liveStatus?: string
}) {
  const [elapsed, setElapsed] = useState(0)
  const isResearch = Boolean(research?.usedWeb || research?.steps.length || isWorldResearchPrompt(query))
  const steps = research?.steps || []
  const visibleSources = research?.sources.slice(0, 6) || []

  // Elapsed time is measured, not animated — the row at the end reports how long
  // the turn actually took. Only a web research timeline has that row; plain
  // chat never shows a timer. The bubble exists only while its answer streams,
  // so the interval dies with it the moment the first text arrives.
  useEffect(() => {
    if (!isResearch) return
    const startedAt = research?.startedAt || Date.now()
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [isResearch, query, research?.startedAt])

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
    // Plain chat: a label and one live status line — no step list, no timer.
    // MalikSearchMotion reads data-malik-status to render its animated widget.
    return (
      <p className="malik-thinking-line" aria-live="polite" data-malik-status={liveStatus || undefined}>
        {labelMap[generationType] || labelMap.text}
        <span className="malik-thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {liveStatus ? <span className="malik-thinking-status">{liveStatus}</span> : null}
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

type FactRecheck = {
  state: "loading" | "done" | "error"
  verdict?: "supported" | "missing"
  summary?: string
  sources?: MalikWebSource[]
}

function SourceChips({ items }: { items: MalikWebSource[] }) {
  if (!items.length) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {items.slice(0, 4).map((source, index) => (
        <a
          key={`${source.url}-${index}`}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-white/10 px-1.5 py-px text-[10.5px] text-zinc-400 transition hover:border-white/25 hover:text-white"
        >
          {sourceDisplayName(source)}
        </a>
      ))}
    </span>
  )
}

/**
 * One checked figure, and the button that checks it properly.
 *
 * The first verdict can only say whether the figure was on the pages that
 * happened to be open. That is a weak "no": those pages were fetched for the
 * whole question, not for this number. So a figure that failed — or one that
 * was never checked at all, because the answer was written without a search —
 * carries a button that goes and looks for that number specifically. It either
 * clears the flag, which a warning-only feature could never do, or fails to
 * find it on pages fetched to find it, which is a much harder result.
 */
function FactClaimRow({
  claim,
  sources,
  repeatsSentence = false,
  recheck,
  onRecheck,
}: {
  claim: MalikFactClaim
  sources: MalikWebSource[]
  repeatsSentence?: boolean
  recheck?: FactRecheck
  onRecheck?: (claim: MalikFactClaim) => void
}) {
  const verdict = recheck?.state === "done" && recheck.verdict ? recheck.verdict : claim.verdict
  const supported = verdict === "supported"
  const unchecked = verdict === "unchecked"
  const chips = claim.sourceIndexes.map((index) => sources[index - 1]).filter(Boolean) as MalikWebSource[]
  const canRecheck = Boolean(onRecheck) && claim.kind === "figure" && (verdict === "missing" || verdict === "unchecked")

  return (
    <li className="flex gap-2.5 rounded-xl px-2 py-1.5">
      {/* No colour anywhere in this panel. What a figure needs is told by
          contrast instead: a solid white marker is a problem, a faint one is
          a confirmation, an outlined one has not been looked at. That reads
          the same on a grayscale screen, for a colour-blind reader, and in a
          printed screenshot. */}
      <span
        className={cn(
          "mt-[3px] grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full text-[10px] font-bold leading-none",
          supported && "bg-white/10 text-zinc-400",
          unchecked && "border border-white/25 text-zinc-500",
          !supported && !unchecked && "bg-white text-black",
        )}
        aria-hidden="true"
      >
        {supported ? "✓" : unchecked ? "?" : "!"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] leading-5">
          <strong className={cn("font-semibold", supported || unchecked ? "text-zinc-300" : "text-white")}>{claim.value}</strong>
          {claim.sentence && !repeatsSentence ? <span className="text-zinc-500"> — {claim.sentence}</span> : null}
        </span>

        {/* Two figures out of one sentence say the same thing twice, so the
            second one shows only the number. */}
        {claim.note && !repeatsSentence && !recheck ? (
          <small className="mt-0.5 block text-[11px] leading-4 text-zinc-600">{claim.note}</small>
        ) : null}

        {recheck?.state === "done" && recheck.summary ? (
          <small className="mt-0.5 block text-[11px] leading-4 text-zinc-500">{recheck.summary}</small>
        ) : null}
        {recheck?.state === "error" ? (
          <small className="mt-0.5 block text-[11px] leading-4 text-zinc-600">{recheck.summary || "Проверка не прошла."}</small>
        ) : null}

        {recheck?.sources?.length ? <SourceChips items={recheck.sources} /> : chips.length ? <SourceChips items={chips} /> : null}

        {canRecheck ? (
          <button
            type="button"
            onClick={() => onRecheck?.(claim)}
            disabled={recheck?.state === "loading"}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-white/30 hover:text-white disabled:cursor-wait disabled:text-zinc-500"
          >
            {recheck?.state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            {recheck?.state === "loading" ? "Ищу это число…" : "Проверить это число"}
          </button>
        ) : null}
      </span>
    </li>
  )
}

/**
 * The answer's own figures, checked against the pages it was written from.
 *
 * Two rules decide what this looks like. Anything that failed is visible
 * without a click, because a reader who has to open a panel to learn that a
 * number is unverified will not open it. And a clean answer says so in one
 * quiet line, because a badge that only ever appears when something is wrong
 * teaches people to skim past it when it is right.
 */
function FactAuditPanel({
  audit,
  sources,
  question = "",
  answer = "",
}: {
  audit: MalikFactAudit
  sources: MalikWebSource[]
  question?: string
  answer?: string
}) {
  const [open, setOpen] = useState(false)
  const [checks, setChecks] = useState<Record<string, FactRecheck>>({})
  const [liveAudit, setLiveAudit] = useState<MalikFactAudit | null>(null)
  const [liveSources, setLiveSources] = useState<MalikWebSource[] | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const [answerError, setAnswerError] = useState("")

  const shown = liveAudit || audit
  const shownSources = liveSources || sources
  const flagged = shown.status === "flagged"
  const unchecked = shown.status === "unchecked"

  const problems = shown.claims.filter((claim) => claim.verdict !== "supported")
  const confirmed = shown.claims.filter((claim) => claim.verdict === "supported")
  const rows = open ? [...problems, ...confirmed] : problems.slice(0, 2)
  const hidden = problems.length + confirmed.length - rows.length

  const resolved = shown.claims.filter((claim) => checks[claim.id]?.state === "done")
  const cleared = resolved.filter((claim) => checks[claim.id]?.verdict === "supported").length
  const recheckNote = resolved.length
    ? `Перепроверено отдельно: ${resolved.length} · подтвердилось ${cleared}`
    : ""

  const verify = async (payload: Record<string, string>) => {
    const response = await clientFetchWithTimeout("/api/ai/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, ...payload }),
    }, 45_000)
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) throw new Error(String(data?.error || "Проверка не прошла."))
    return data
  }

  const recheckClaim = async (claim: MalikFactClaim) => {
    setChecks((current) => ({ ...current, [claim.id]: { state: "loading" } }))
    try {
      const data = await verify({ claim: claim.value, sentence: claim.sentence || "" })
      setChecks((current) => ({
        ...current,
        [claim.id]: { state: "done", verdict: data.verdict, summary: data.summary, sources: (data.sources || []).slice(0, 3) },
      }))
    } catch (error) {
      setChecks((current) => ({
        ...current,
        [claim.id]: { state: "error", summary: error instanceof Error ? error.message : "Проверка не прошла." },
      }))
    }
  }

  const checkWholeAnswer = async () => {
    setCheckingAll(true)
    setAnswerError("")
    try {
      const data = await verify({ answer })
      if (data.audit) {
        setLiveAudit(data.audit as MalikFactAudit)
        setLiveSources((data.sources || []) as MalikWebSource[])
        setOpen(true)
      } else {
        setAnswerError("В открытых источниках не нашлось страниц по этому вопросу.")
      }
    } catch (error) {
      setAnswerError(error instanceof Error ? error.message : "Проверка не прошла.")
    } finally {
      setCheckingAll(false)
    }
  }

  return (
    <section
      data-malik-fact-audit={shown.status}
      data-preserve-brand-color="true"
      className={cn(
        // Pure black, like the page behind it. #0b0b0c was a grey card laid on
        // a black screen; the border alone says where the panel starts.
        "malik-fact-audit mt-3 w-full max-w-[680px] overflow-hidden rounded-2xl border bg-black text-left",
        flagged ? "border-white/25" : "border-white/10",
      )}
      aria-label="Проверка фактов по источникам"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-lg",
            flagged ? "bg-white text-black" : unchecked ? "border border-white/20 text-zinc-400" : "bg-white/10 text-zinc-300",
          )}
          aria-hidden="true"
        >
          {flagged ? <TriangleAlert className="h-3.5 w-3.5" /> : unchecked ? <Search className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="-my-2 min-w-0 flex-1 py-2 text-left"
        >
          <strong className={cn("block text-[12.5px] font-semibold", flagged ? "text-white" : "text-zinc-300")}>
            {flagged ? "Проверка фактов: есть что перепроверить" : unchecked ? "Факты не проверены" : "Проверка фактов пройдена"}
          </strong>
          {/* The count is the whole message, so on a phone it wraps rather
              than getting cut off mid-word. */}
          <small className="mt-px block text-[11px] leading-4 text-zinc-500">{answerError || shown.summary}</small>
          {/* The header keeps the verdict the server reached; what the reader
              found by re-checking is reported next to it rather than quietly
              rewritten into it. */}
          {recheckNote ? <small className="mt-px block text-[11px] leading-4 text-zinc-600">{recheckNote}</small> : null}
        </button>

        {/* An answer written without a search has never been compared with
            anything. Saying that is honest but useless on its own, so the way
            to fix it sits right next to the sentence that reports it. */}
        {unchecked && answer ? (
          <button
            type="button"
            onClick={checkWholeAnswer}
            disabled={checkingAll}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:text-zinc-500"
          >
            {checkingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            {checkingAll ? "Проверяю…" : "Проверить"}
          </button>
        ) : null}

        <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "Свернуть" : "Развернуть"} className="shrink-0">
          <ChevronRight className={cn("h-4 w-4 text-zinc-600 transition-transform", open && "rotate-90")} />
        </button>
      </div>

      {rows.length ? (
        <ul className="border-t border-white/[0.06] px-2 py-2">
          {rows.map((claim, index) => (
            <FactClaimRow
              key={claim.id}
              claim={claim}
              sources={shownSources}
              repeatsSentence={index > 0 && Boolean(claim.sentence) && rows[index - 1].sentence === claim.sentence}
              recheck={checks[claim.id]}
              onRecheck={question ? recheckClaim : undefined}
            />
          ))}
          {!open && hidden > 0 ? (
            <li>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full rounded-lg px-2 pb-0.5 pt-1 text-left text-[11px] text-zinc-500 transition hover:text-zinc-300"
              >
                Показать ещё {hidden} — и подтверждённые факты
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
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
  workspaceMode = "chat",
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
  question = "",
  previousQuestion = "",
  questionHasAttachment = false,
  onEditPrompt,
  onFollowUp,
  showFollowUps = false,
  onOpenSheet,
  isLatest = false,
  freshTurn = false,
}: {
  message: Message
  workspaceMode?: WorkspaceMode
  onCopy: (id: string, text: string) => void
  /** Open this answer on its own page (the answer sheet). */
  onOpenSheet?: (id: string) => void
  copied: boolean
  /** The user turn this answer replies to — what a re-check searches for. */
  question?: string
  previousQuestion?: string
  questionHasAttachment?: boolean
  generationType?: GenerationStatusType

  thinkingQuery?: string
  onRegenerate?: (id: string) => void
  onShare?: (text: string) => void
  onFeedback?: (id: string, value: "up" | "down") => void
  /** Puts a message back in the composer to edit and send again. */
  onEditPrompt?: (id: string, text: string) => void
  /** Sends a follow-up ("Подробнее", "Короче" …). */
  onFollowUp?: (text: string, options?: FollowUpSendOptions) => void
  /** Only under the newest finished answer. */
  showFollowUps?: boolean
  feedback?: "up" | "down" | null
  onImageConfirmation?: (messageId: string, prompt: string, action: "confirm" | "cancel" | "generate", imageSize?: ImageResolution) => void
  imageCredits?: ImageCreditSnapshot | null
  onOpenActionTarget?: (target: MalikActionTarget) => void
  videoAnalysis?: boolean
  /** The newest row of the thread — the only one that may still be live. */
  isLatest?: boolean
  /** Part of the turn that was just sent (entry animation). */
  freshTurn?: boolean
}) {
  const isUser = message.role === "user"
  // Only the newest answer can be in progress. An older row that still says
  // isStreaming is a leftover placeholder (an interrupted or duplicated turn);
  // it must never keep a thinking indicator or a timer alive above the thread.
  const streaming = Boolean(message.isStreaming) && isLatest
  const isThinking = Boolean(streaming && !message.content && !message.generatedMedia)
  // Regenerated answers: the newest is shown; earlier ones can be paged back to.
  const versionTotal = !isUser && !streaming && message.versions?.length ? message.versions.length + 1 : 1
  const [versionIndex, setVersionIndex] = useState(-1)
  const versionCount = message.versions?.length || 0
  // A new version arrived: show it, not the one that was being looked at.
  useEffect(() => { setVersionIndex(-1) }, [versionCount])
  const shownVersion = versionIndex < 0 || versionIndex >= versionTotal - 1 ? versionTotal - 1 : versionIndex
  const olderVersion = versionTotal > 1 && shownVersion < versionTotal - 1 ? message.versions![shownVersion] : null
  const displayContent = isUser
    ? message.content
    : olderVersion
      ? olderVersion.content
      : cleanResearchDisplayText(message.content, message.research)
  const responseModel = !isUser && message.modelId ? getMalikModel(message.modelId) : null
  if (!isUser && message.isStreaming && !streaming && !displayContent && !message.generatedMedia && !message.imageConfirmation) {
    return null
  }
  const writingLive = !isUser && streaming && Boolean(displayContent) && !message.generatedMedia && !message.imageConfirmation
  return (
    <div
      data-malik-message={message.role}
      className={cn(
        "malik-message-row flex w-full gap-3 sm:gap-4",
        isUser ? "malik-message-row-user justify-end" : "malik-message-row-assistant justify-start",
        freshTurn && "malik-live-enter",
        writingLive && "malik-live-writing",
      )}
    >
      {/* The mark is a progress indicator, not a byline: it appears while the
          answer is being produced and leaves with the spinner. A finished
          answer stands on its own, the way every mainstream assistant shows
          one. While text is already streaming it stays in the DOM (other
          runtimes read it as "turn in progress") but chat-live.css hides it,
          so the answer does not shift sideways when it completes. */}
      {!isUser && streaming && (
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
          {!isUser && message.execution && !olderVersion ? <ChatExecution trace={message.execution} live={streaming} sources={message.research?.sources} workMode={workspaceMode === "work"} /> : null}
          {!isUser && !message.execution && !streaming && message.thought && !olderVersion && !message.generatedMedia && !message.superflow ? (
            <ThoughtTrace thought={message.thought} sources={message.research?.usedWeb ? message.research.sources.length : 0} />
          ) : null}
          {isUser && message.attachments?.length ? <UserAttachmentGallery items={message.attachments} /> : null}
          {!isUser && message.superflow ? (
            <SuperflowBlock messageId={message.id} reference={message.superflow} />
          ) : message.generatedMedia ? (
            <GeminiMediaGenerationCard media={message.generatedMedia} />
          ) : message.imageConfirmation ? (
            <section className="malik-image-credit-confirmation w-full max-w-[560px] rounded-[1.4rem] border border-white/20 bg-black p-4 shadow-[0_18px_60px_rgba(0,0,0,.72)] sm:p-5" aria-label="Подтверждение генерации изображения">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-black"><ImageIcon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-white">Создать изображение?</h3>
                  <p className="mt-1 line-clamp-3 text-sm leading-5 text-white/70">{message.imageConfirmation.prompt}</p>
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
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/65">Качество</span>
                    <span className="text-xs font-semibold text-white">
                      Фото-кредиты: {imageCredits ? formatImageCreditBalance(imageCredits.remaining) : "…"}
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
                              ? "cursor-not-allowed border-white/10 bg-black text-white/30"
                              : "border-white/20 bg-[#090909] text-white hover:border-white/40 hover:bg-[#111111]",
                          )}
                          title={blocked4k ? "Лимит 4K на сегодня исчерпан" : blockedByCredits ? "Недостаточно фото-кредитов" : undefined}
                        >
                          <span className="block">{size}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold text-white/65">{formatImageCreditCount(cost)}</span>
                        </button>
                      )
                    })}
                  </div>
                  {imageCredits ? (
                    <p className="mt-2 text-[11px] font-medium text-white/55">
                      Доступно {formatImageCreditBalance(imageCredits.remaining)} из {formatImageCreditBalance(imageCredits.daily)} · 4K: {imageCredits.remaining4k > 1_000_000 ? "∞" : imageCredits.remaining4k} осталось
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
                    {/* While streaming, `malik-streaming` gives the growing
                        answer its caret and lets only newly added blocks
                        fade in (chat-live.css). It is dropped when done. */}
                    <MalikMarkdown text={displayContent} allowImages={false} className={writingLive ? "malik-streaming" : undefined}
                      visualContext={!olderVersion && !message.generatedMedia && !message.imageConfirmation && !message.superflow
                        ? { question, previousQuestion, hasAttachment: questionHasAttachment, isLatest, streaming } : undefined} />
                    {streaming && videoAnalysis ? <VideoAnalysisPulse compact /> : null}
                  </>
                )
            )
            : (streaming
              ? message.execution ? null : <ThinkingBubble generationType={generationType} query={thinkingQuery} research={message.research} videoAnalysis={videoAnalysis} liveStatus={message.liveStatus} />
              : "")}
          {/* Grounded UI how-to: interactive arrow navigator only after the answer is complete. */}
          {!isUser && !streaming && !olderVersion && !message.generatedMedia && !message.imageConfirmation && !message.superflow && Boolean(displayContent) ? (
            <MalikTapGuide question={question} answer={displayContent} />
          ) : null}
          {/* The verdict on the text above comes before the reading list it was
              written from. */}
          {!isUser && !streaming && message.research?.factAudit ? (
            <FactAuditPanel
              audit={message.research.factAudit}
              sources={message.research.sources}
              question={question}
              answer={displayContent}
            />
          ) : null}
          {!isUser && !streaming && message.research?.sources.length ? (
            <SourceDeck research={message.research} />
          ) : null}
        </div>
        {!isUser && message.content && !streaming && !message.imageConfirmation && (
          <div className={cn("malik-message-actions mt-2 flex min-w-0 flex-wrap items-center gap-2 text-zinc-500", Boolean(message.research?.sources.length) && "is-research", isLatest && "is-latest")}>
            <button
              type="button"
              title={copied ? "Скопировано" : "Копировать"}
              aria-label={copied ? "Скопировано" : "Копировать ответ"}
              onClick={() => onCopy(message.id, displayContent)}
              className={cn("malik-copy-action inline-flex items-center gap-1.5 rounded-md p-1 hover:bg-white/10 hover:text-white", copied && "is-copied")}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? <span className="malik-copy-action__label" role="status">Скопировано</span> : null}
            </button>
            <VersionPager index={shownVersion} total={versionTotal} onChange={setVersionIndex} />
            <ReadAloudButton id={message.id} text={displayContent} />
            <AnswerDownloadButton text={displayContent} />
            <button type="button" title="Перегенерировать" onClick={() => onRegenerate?.(message.id)} className="rounded-md p-1 hover:bg-white/10 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
            <button type="button" title="Полезно" aria-pressed={feedback === "up"} onClick={() => onFeedback?.(message.id, "up")} className={cn("malik-feedback-action rounded-md p-1 hover:bg-white/10 hover:text-white", feedback === "up" && "is-active")}><ThumbsUp className="h-4 w-4" /></button>
            <button type="button" title="Не полезно" aria-pressed={feedback === "down"} onClick={() => onFeedback?.(message.id, "down")} className={cn("malik-feedback-action rounded-md p-1 hover:bg-white/10 hover:text-white", feedback === "down" && "is-active")}><ThumbsDown className="h-4 w-4" /></button>
            <button type="button" title="Поделиться" onClick={() => onShare?.(displayContent)} className="rounded-md p-1 hover:bg-white/10 hover:text-white"><Share className="h-4 w-4" /></button>
            {onOpenSheet && displayContent.trim() ? (
              <button type="button" title="Открыть на листе" aria-label="Открыть ответ на листе с экспортом PDF" onClick={() => onOpenSheet(message.id)} className="malik-open-sheet inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium hover:bg-white/10 hover:text-white">
                <FileText className="h-4 w-4" />
                <span>Лист / PDF</span>
              </button>
            ) : null}
          </div>
        )}
        {!isUser && showFollowUps && onFollowUp ? <FollowUpChips onSend={onFollowUp} question={question} answer={displayContent} hasAttachment={questionHasAttachment} /> : null}
        {isUser && message.content ? <UserMessageActions id={message.id} text={message.content} onEdit={onEditPrompt} /> : null}
      </div>
      {/* No initials disc beside the user's own turn either — the bubble and
          its right alignment already say who wrote it. */}
    </div>
  )
}

// A live answer updates `messages` many times a second. Memoising the row
// keeps every settled message (and its Markdown parse) out of those renders:
// only the row whose message object changed re-renders.
const MemoMessageBubble = React.memo(MessageBubble)

/** Distance (px) from the bottom of the thread at which the reader counts as "at the newest line". */
const FOLLOW_EPSILON_PX = 6
/** Scrolled further up than this, the round "to the newest" button appears. */
const JUMP_BUTTON_THRESHOLD_PX = 200

export function ChatView({ messages, workspaceMode = "chat", onSendMessage, onImageConfirmation, isLoading, canStopGeneration = false, onStopGeneration, currentUser = "User", userPlan = "free", selectedModelId = DEFAULT_MALIK_MODEL_ID, onModelChange, onOpenBilling, onOpenPlugins, onOpenProjects, onNewTask, onOpenCodex, onForceCanvas, onOpenVoice, onOpenActionTarget, projectName, projectDescription }: ChatViewProps) {
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
  // The answer sheet: one answer on its own page. `auto` is a sheet that
  // opened by itself because a document was asked for.
  const [sheet, setSheet] = useState<{ id: string; auto: boolean } | null>(null)
  const closedSheets = useRef<Set<string>>(new Set())
  const [imageCredits, setImageCredits] = useState<ImageCreditSnapshot | null>(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [imageCreatorOpen, setImageCreatorOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [drawingOpen, setDrawingOpen] = useState(false)
  const [toolWorkspace, setToolWorkspace] = useState<ChatToolWorkspaceMode | null>(null)
  const [researchMode, setResearchMode] = useState<"off" | "web" | "deep">("off")
  const [editSourceId, setEditSourceId] = useState<string | null>(null)
  const [queuedTurn, setQueuedTurn] = useState<{
    id: string
    message: string
    display: string
    attachments: ChatAttachment[]
    options: ChatSendOptions
  } | null>(null)
  const queueDispatchRef = useRef(false)

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "")
    folderInputRef.current?.setAttribute("directory", "")
  }, [])
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
  const imageInputRef = useRef<HTMLInputElement>(null)
  const allInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const attachButtonRef = useRef<HTMLButtonElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    const fill = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      if (typeof text !== "string" || !text.trim()) return
      setPrompt(text)
      window.setTimeout(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(text.length, text.length)
      }, 0)
    }

    const pending = takePrefillPrompt()
    if (pending) fill(new CustomEvent(PREFILL_EVENT, { detail: pending }))

    window.addEventListener(PREFILL_EVENT, fill)
    return () => window.removeEventListener(PREFILL_EVENT, fill)
  }, [])
  const chunksRef = useRef<Blob[]>([])

  const attachmentFromEditorSource = async (rawSource: string): Promise<ChatAttachment> => {
    const source = String(rawSource || "").trim()
    if (!source) throw new Error("Исходное изображение не найдено.")

    const masterMarker = source.lastIndexOf("#malik-master=")
    let sourceReference = source
    if (masterMarker >= 0) {
      try {
        sourceReference = decodeURIComponent(source.slice(masterMarker + "#malik-master=".length)) || source.slice(0, masterMarker)
      } catch {
        sourceReference = source.slice(0, masterMarker)
      }
    }

    const resolved = await resolveGeneratedImageUrl(sourceReference)
    let blob: Blob | null = null

    try {
      const response = await fetch(resolved, { cache: "force-cache", credentials: "same-origin" })
      if (response.ok) blob = await response.blob()
    } catch {
      blob = null
    }

    if ((!blob || !blob.type.startsWith("image/")) && /^https?:\/\//i.test(resolved)) {
      const imported = await fetch("/api/attachments/import-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ url: resolved }),
      })
      const payload = await imported.json().catch(() => ({}))
      if (imported.ok && payload?.ok && payload?.file?.base64) {
        const binary = atob(String(payload.file.base64))
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
        blob = new Blob([bytes], { type: String(payload.file.mime || "image/png") })
      }
    }

    if (!blob || !blob.size || !blob.type.startsWith("image/")) {
      throw new Error("Не удалось подготовить исходное изображение для редактирования.")
    }

    const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg"
    const file = new File([blob], `malik-editor-source-${Date.now()}.${extension}`, { type: blob.type })
    return fileToAttachment(file)
  }

  useEffect(() => {
    const onEditorRequest = (event: Event) => {
      const detail = (event as CustomEvent<MalikImageEditorRequest>).detail
      if (!detail?.sourceSrc || !detail?.prompt) return
      if (isLoading) {
        setLocalError("Дождитесь завершения текущей генерации.")
        return
      }

      void (async () => {
        try {
          setLocalError(null)
          const sourceAttachment = await attachmentFromEditorSource(detail.sourceSrc)
          const selection = detail.selection
          const selectedRegionInstruction = selection
            ? [
                "",
                "IMPORTANT EDIT REGION:",
                `Edit only the user-selected region: left ${selection.left.toFixed(1)}%, top ${selection.top.toFixed(1)}%, width ${selection.width.toFixed(1)}%, height ${selection.height.toFixed(1)}%.`,
                "Preserve everything outside that selected region as closely as possible: identity, composition, colors, geometry, text, lighting and background.",
              ].join("\n")
            : ""

          const prompt = `${detail.prompt.trim()}${selectedRegionInstruction}`
          queueMalikImageLineage(detail.sourceSrc, detail.mode)
          setLastSubmittedPrompt(prompt)
          try { window.localStorage.setItem("malik_last_user_prompt", prompt) } catch {}

          onSendMessage(`/image ${prompt}`, [sourceAttachment], {
            responseDepth,
            imageSize: detail.imageSize || "1K",
            imageAspectRatio: detail.imageAspectRatio,
          })
        } catch (error) {
          setLocalError(error instanceof Error ? error.message : "Не удалось открыть изображение в редакторе.")
        }
      })()
    }

    window.addEventListener(MALIK_IMAGE_EDITOR_REQUEST_EVENT, onEditorRequest)
    return () => window.removeEventListener(MALIK_IMAGE_EDITOR_REQUEST_EVENT, onEditorRequest)
  }, [isLoading, onSendMessage, responseDepth])

  // ---- Following the newest line ------------------------------------------
  // The thread sticks to the bottom only while the reader is already there.
  // Any upward move by the person (wheel, touch drag, keys, scrollbar) stops
  // the following at once, so a streaming answer never yanks them back down
  // while they read something above; reaching the bottom again, sending a
  // message or pressing the round arrow button turns it back on.
  //
  // Only the thread element scrolls (never scrollIntoView: that can also pan
  // Safari's document while the keyboard is up). The target is the real
  // maximum scrollTop, which ChatTurnScrollRuntime deliberately leaves alone —
  // it only swallows the legacy "jump to scrollHeight on every token" shape.
  const threadRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  // Until this moment (performance.now) following glides instead of jumping:
  // the short window right after a send, while the new rows settle.
  const smoothFollowUntilRef = useRef(0)
  const turnKeyRef = useRef<{ first?: string; lastUser?: string }>({})
  const [showJumpButton, setShowJumpButton] = useState(false)
  const firstMessageId = messages[0]?.id
  const lastUserMessageId = useMemo(() => [...messages].reverse().find((message) => message.role === "user")?.id, [messages])

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior) => {
    const thread = threadRef.current
    if (!thread) return
    const top = Math.max(0, thread.scrollHeight - thread.clientHeight)
    if (Math.abs(thread.scrollTop - top) < 1) return
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    thread.scrollTo({ top, behavior: reduceMotion ? "auto" : behavior })
  }, [])

  // Another chat opened → start at its newest line at once. A new message
  // sent in this chat → follow again and glide down to it (two frames, so
  // ChatTurnScrollRuntime's one-time viewport restore runs first).
  useEffect(() => {
    const previous = turnKeyRef.current
    turnKeyRef.current = { first: firstMessageId, lastUser: lastUserMessageId }
    followRef.current = true
    const sameChat = previous.first !== undefined && previous.first === firstMessageId
    const sent = sameChat && Boolean(lastUserMessageId) && previous.lastUser !== lastUserMessageId
    if (sent) smoothFollowUntilRef.current = performance.now() + 700
    let second = 0
    const first = window.requestAnimationFrame(() => {
      if (!sent) {
        scrollThreadToBottom("auto")
        return
      }
      second = window.requestAnimationFrame(() => scrollThreadToBottom("smooth"))
    })
    return () => {
      window.cancelAnimationFrame(first)
      if (second) window.cancelAnimationFrame(second)
    }
  }, [firstMessageId, lastUserMessageId, scrollThreadToBottom])

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    const list = thread.querySelector<HTMLElement>(".malik-message-list")
    let lastTop = thread.scrollTop
    let touchY: number | null = null

    const distance = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight
    const syncJumpButton = () => setShowJumpButton(distance() > JUMP_BUTTON_THRESHOLD_PX)
    const stopFollowing = () => {
      followRef.current = false
      smoothFollowUntilRef.current = 0
    }

    const onScroll = () => {
      const top = thread.scrollTop
      const away = distance()
      if (away <= FOLLOW_EPSILON_PX) followRef.current = true
      // Moving up and ending away from the bottom is the person reading
      // above (this also catches find-in-page and middle-click scrolling).
      // A clamp after content shrinks keeps the view at the bottom, so it
      // does not count.
      else if (top < lastTop - 2 && away > 24) stopFollowing()
      lastTop = top
      syncJumpButton()
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) stopFollowing()
    }
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? null
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY
      // Finger moving down scrolls the thread up, towards older messages.
      if (touchY !== null && typeof y === "number" && y > touchY + 4) stopFollowing()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) stopFollowing()
    }
    const onPointerDown = (event: PointerEvent) => {
      // A press on the thread itself (not on a message) is its scrollbar.
      if (event.target === thread) stopFollowing()
    }
    const onResize = () => {
      if (followRef.current) {
        scrollThreadToBottom(performance.now() < smoothFollowUntilRef.current ? "smooth" : "auto")
      }
      syncJumpButton()
    }

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null
    observer?.observe(thread)
    if (list) observer?.observe(list)
    thread.addEventListener("scroll", onScroll, { passive: true })
    thread.addEventListener("wheel", onWheel, { passive: true })
    thread.addEventListener("touchstart", onTouchStart, { passive: true })
    thread.addEventListener("touchmove", onTouchMove, { passive: true })
    thread.addEventListener("keydown", onKeyDown)
    thread.addEventListener("pointerdown", onPointerDown)
    return () => {
      observer?.disconnect()
      thread.removeEventListener("scroll", onScroll)
      thread.removeEventListener("wheel", onWheel)
      thread.removeEventListener("touchstart", onTouchStart)
      thread.removeEventListener("touchmove", onTouchMove)
      thread.removeEventListener("keydown", onKeyDown)
      thread.removeEventListener("pointerdown", onPointerDown)
    }
  }, [scrollThreadToBottom])

  const jumpToNewest = useCallback(() => {
    followRef.current = true
    smoothFollowUntilRef.current = performance.now() + 500
    setShowJumpButton(false)
    scrollThreadToBottom("smooth")
  }, [scrollThreadToBottom])

  // On some layouts (phones) the composer floats over the bottom of the
  // thread. The thread then reserves exactly that much room at its end, so
  // the last lines and the answer's actions are never hidden under it.
  useEffect(() => {
    const thread = threadRef.current
    const dock = thread?.parentElement?.querySelector<HTMLElement>(".malik-composer-dock")
    if (!thread || !dock) return
    const measure = () => {
      const overlap = Math.max(0, Math.round(thread.getBoundingClientRect().bottom - dock.getBoundingClientRect().top))
      thread.style.setProperty("--malik-dock-overlap", `${overlap}px`)
      if (followRef.current) scrollThreadToBottom("auto")
    }
    measure()
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    observer?.observe(dock)
    observer?.observe(thread)
    window.addEventListener("resize", measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [scrollThreadToBottom])
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
        if (imported.length) setAttachments((previous) => [...previous, ...imported].slice(0, MAX_CHAT_ATTACHMENTS))
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
      const width = Math.min(430, Math.max(280, window.innerWidth - 24))
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
    const room = Math.max(0, MAX_CHAT_ATTACHMENTS - attachments.length)
    if (!room) {
      setLocalError(`Можно прикрепить максимум ${MAX_CHAT_ATTACHMENTS} файлов.`)
      return
    }
    const parsed: ChatAttachment[] = []
    let firstError = ""
    for (const file of Array.from(files).slice(0, room)) {
      try {
        parsed.push(await fileToAttachment(file))
      } catch (error) {
        if (!firstError) firstError = error instanceof Error ? error.message : "Ошибка файла"
      }
    }
    if (parsed.length) setAttachments((previous) => [...previous, ...parsed].slice(0, MAX_CHAT_ATTACHMENTS))
    if (files.length > room && !firstError) firstError = `Можно прикрепить максимум ${MAX_CHAT_ATTACHMENTS} файлов.`
    setLocalError(firstError || null)
    setShowAttachMenu(false)
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
      setAttachments((previous) => [...previous, attachment].slice(0, MAX_CHAT_ATTACHMENTS))
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
    setAttachments((previous) => [...previous, attachment].slice(0, MAX_CHAT_ATTACHMENTS))
    setCodeText("")
    setCodeModalOpen(false)
    setShowAttachMenu(false)
  }

  const addUrlAttachment = () => {
    const clean = urlText.trim()
    if (!clean) return
    const attachment: ChatAttachment = { id: crypto.randomUUID(), name: clean, mime: "text/uri-list", size: clean.length, kind: "url", url: clean }
    setAttachments((previous) => [...previous, attachment].slice(0, MAX_CHAT_ATTACHMENTS))
    setUrlText("")
    setUrlModalOpen(false)
    setShowAttachMenu(false)
  }

  const handleGuardedSubmit = () => {
    const rawText = prompt.trim()
    if (!rawText && attachments.length === 0) return

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
    const sendOptions: ChatSendOptions = {
      workspaceMode,
      responseDepth: researchMode === "deep" ? "deep" : responseDepth,
      research: researchMode !== "off" ? true : undefined,
      branchFromMessageId: editSourceId || undefined,
    }

    setLocalError(null)
    try { window.localStorage.setItem("malik_last_user_prompt", outgoing) } catch {}
    setLastSubmittedPrompt(outgoing)

    if (isLoading) {
      if (queuedTurn) {
        setLocalError("В очереди уже есть следующий запрос. Отмените его или дождитесь запуска.")
        return
      }
      setQueuedTurn({
        id: crypto.randomUUID(),
        message: routedOutgoing,
        display: outgoing,
        attachments: [...attachments],
        options: { ...sendOptions, queueDispatch: true },
      })
    } else {
      onSendMessage(routedOutgoing, attachments, sendOptions)
    }

    setPrompt("")
    setAttachments([])
    setEditSourceId(null)
    setResearchMode("off")
    setShowAttachMenu(false)
  }

  // One real queued follow-up: while Malik is writing, Enter stores the next
  // turn instead of rejecting it. It launches as soon as the current stream
  // settles (including after the user presses Stop).
  useEffect(() => {
    if (isLoading) {
      queueDispatchRef.current = false
      return
    }
    if (!queuedTurn || queueDispatchRef.current) return
    queueDispatchRef.current = true
    const next = queuedTurn
    setQueuedTurn(null)
    window.setTimeout(() => {
      onSendMessage(next.message, next.attachments, next.options)
      queueDispatchRef.current = false
    }, 0)
  }, [isLoading, onSendMessage, queuedTurn])

  // The row callbacks below are stable (useCallback + a ref to the latest
  // values), so the memoised rows are not re-rendered by every streamed chunk.
  const copyResetTimerRef = useRef(0)
  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text || "")
      setCopiedId(id)
      window.clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = window.setTimeout(() => setCopiedId(null), 1600)
    } catch {
      setLocalError("Clipboard blocked. Текст можно выделить и скопировать вручную.")
      window.setTimeout(() => setLocalError(null), 2200)
    }
  }, [])

  const regenerateContextRef = useRef({ messages, onSendMessage, responseDepth })
  useEffect(() => {
    regenerateContextRef.current = { messages, onSendMessage, responseDepth }
  }, [messages, onSendMessage, responseDepth])
  const handleRegenerate = useCallback((messageId: string) => {
    const { messages: current, onSendMessage: send, responseDepth: depth } = regenerateContextRef.current
    const index = current.findIndex((item) => item.id === messageId)
    if (index <= 0) return
    for (let i = index - 1; i >= 0; i -= 1) {
      if (current[i].role === "user" && current[i].content.trim()) {
        // The newest answer is regenerated in place, keeping the old one as a
        // version; an older answer is asked again below, as before.
        const latest = index === current.length - 1
        send(current[i].content, [], latest ? { responseDepth: depth, regenerateMessageId: messageId } : { responseDepth: depth })
        return
      }
    }
  }, [])

  // Editing a historical turn is not destructive: dashboard forks the chat at
  // the exact message when the edited prompt is sent.
  const handleEditPrompt = useCallback((messageId: string, text: string) => {
    setEditSourceId(messageId || null)
    setPrompt(text)
    window.setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(text.length, text.length)
    }, 0)
  }, [])

  const restoreLastPrompt = useCallback((text: string) => {
    setEditSourceId(null)
    setPrompt(text)
    window.setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(text.length, text.length)
    }, 0)
  }, [])

  const handleFollowUp = useCallback((text: string, options?: FollowUpSendOptions) => {
    const { onSendMessage: send, responseDepth: depth } = regenerateContextRef.current
    send(text, [], { responseDepth: depth, research: options?.research === true ? true : undefined })
  }, [])

  const promptValueRef = useRef("")
  promptValueRef.current = prompt
  const focusComposer = useCallback(() => textareaRef.current?.focus(), [])
  const composerEmpty = useCallback(() => !promptValueRef.current.trim(), [])
  const notifyShortcut = useCallback((text: string) => {
    setLocalError(text)
    window.setTimeout(() => setLocalError(null), 1600)
  }, [])
  useChatShortcuts({ messages, focusComposer, composerEmpty, restoreLastPrompt, notify: notifyShortcut })

  // A document request opens the sheet the moment the answer starts being
  // written, so the reader watches it being written there. Answers that were
  // already in the chat never pop open by themselves.
  const lastMessage = messages[messages.length - 1]
  const lastMessageId = lastMessage?.id
  const lastMessageStreaming = Boolean(lastMessage?.isStreaming)
  // The turn being answered right now: its two rows get the entry animation.
  const liveTurn = Boolean(lastMessage && lastMessage.role === "assistant" && lastMessage.isStreaming)
  useEffect(() => {
    if (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.isStreaming) return
    if (lastMessage.imageConfirmation || lastMessage.generatedMedia) return
    if (closedSheets.current.has(lastMessage.id)) return
    const request = [...messages].reverse().find((item) => item.role === "user")
    if (!request || request.attachments?.length || !isSheetRequest(request.content)) return
    setSheet((current) => (current?.id === lastMessage.id ? current : { id: lastMessage.id, auto: true }))
    // Only a new streaming answer matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId, lastMessageStreaming])

  const closeSheet = React.useCallback(() => {
    setSheet((current) => {
      if (current) closedSheets.current.add(current.id)
      return null
    })
  }, [])

  const sheetIndex = sheet ? messages.findIndex((item) => item.id === sheet.id) : -1
  const sheetMessage = sheetIndex >= 0 ? messages[sheetIndex] : null
  const sheetRequest = sheetMessage
    ? messages.slice(0, sheetIndex).reverse().find((item) => item.role === "user")?.content || ""
    : ""

  const handleShare = useCallback(async (text: string) => {
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
  }, [])

  const handleFeedback = useCallback((messageId: string, value: "up" | "down") => {
    setFeedbackMap((previous) => ({ ...previous, [messageId]: value }))
  }, [])

  const openSheetFor = useCallback((id: string) => setSheet({ id, auto: false }), [])

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
        setAttachments((previous) => [...previous, attachment].slice(0, MAX_CHAT_ATTACHMENTS))
      }
      recorder.start()
      setIsRecording(true)
    } catch {
      setLocalError("Микрофон недоступен. Разрешите доступ в браузере.")
    }
  }

  const focusComposerWith = (value: string) => {
    if (!prompt.trim()) setPrompt(value)
    window.setTimeout(() => {
      textareaRef.current?.focus()
      const length = (prompt.trim() ? prompt : value).length
      textareaRef.current?.setSelectionRange(length, length)
    }, 0)
  }

  const runResearchWorkspace = (mode: "web" | "deep", query: string) => {
    const clean = query.trim()
    if (!clean) return
    if (isLoading) {
      setLocalError("Malik AI уже обрабатывает запрос.")
      return
    }
    setLocalError(null)
    setLastSubmittedPrompt(clean)
    try { window.localStorage.setItem("malik_last_user_prompt", clean) } catch {}
    onSendMessage(clean, [], {
      workspaceMode,
      research: true,
      responseDepth: mode === "deep" ? "deep" : responseDepth,
    })
    setToolWorkspace(null)
    setShowAttachMenu(false)
  }

  const connectAccountTool = (pluginId: "github" | "gmail") => {
    setToolWorkspace(null)
    const current = new URL(window.location.href)
    const returnTo = `${current.pathname}${current.search}${current.hash}` || "/dashboard"
    window.location.assign(`/api/plugins/connect?id=${encodeURIComponent(pluginId)}&return_to=${encodeURIComponent(returnTo)}`)
  }

  const attachItems: Array<{
    label: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    action: () => void
  }> = [
    {
      label: "Добавить фото и файлы",
      description: "Загрузить с компьютера",
      icon: Paperclip,
      action: () => allInputRef.current?.click(),
    },
    {
      label: "Добавить папку",
      description: "Выбрать локальную папку с файлами",
      icon: FolderTree,
      action: () => folderInputRef.current?.click(),
    },
    {
      label: "Добавить файл из библиотеки",
      description: "Просматривайте свои файлы и выполняйте поиск по ним",
      icon: FileSearch,
      action: () => setLibraryOpen(true),
    },
    {
      label: "Создать изображение",
      description: "Создать любое изображение",
      icon: Wand2,
      action: () => setImageCreatorOpen(true),
    },
    {
      label: "Поиск в сети",
      description: "Искать актуальную информацию",
      icon: Search,
      action: () => setToolWorkspace("web"),
    },
    {
      label: "Глубокое исследование",
      description: "Получить подробный отчёт с источниками",
      icon: Globe,
      action: () => setToolWorkspace("deep"),
    },
    {
      label: "Нарисовать",
      description: "Нарисуйте и прикрепите изображение",
      icon: Pencil,
      action: () => setDrawingOpen(true),
    },
    {
      label: "GitHub",
      description: "PR, issues, CI и репозитории",
      icon: Github,
      action: () => setToolWorkspace("github"),
    },
    {
      label: "Gmail",
      description: "Читайте и используйте почту Gmail в Malik AI",
      icon: Mail,
      action: () => setToolWorkspace("gmail"),
    },
  ]

  return (
    <div data-malik-chat-fullwidth="1" data-workspace-mode={workspaceMode} className="malik-chat-fullwidth relative z-[2] flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-transparent text-white">
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

      {imageCreatorOpen ? (
        <ChatImageCreator
          attachments={attachments}
          credits={imageCredits}
          plan={effectivePlan}
          onAddImage={() => imageInputRef.current?.click()}
          onAddFiles={(files) => void handleFiles(files)}
          onRemoveAttachment={removeComposerAttachment}
          onClose={() => setImageCreatorOpen(false)}
        />
      ) : null}

      <ChatToolWorkspace
        mode={toolWorkspace}
        onClose={() => setToolWorkspace(null)}
        onRunResearch={runResearchWorkspace}
        onConnect={connectAccountTool}
      />

      {workspaceMode === "work" ? <nav className="malik-work-tools" aria-label="Инструменты работы">
        {onNewTask ? <button type="button" onClick={onNewTask} disabled={Boolean(isLoading)}><Plus size={15} />Новая задача</button> : null}
        <button type="button" onClick={() => openOs("tasks")}><Check size={15} />Задачи</button>
        <button type="button" onClick={() => openOs("library")}><BookOpen size={15} />Результаты</button>
        <button type="button" onClick={() => setLibraryOpen(true)}><FileSearch size={15} />Мои файлы</button>
        {onOpenProjects ? <button type="button" onClick={onOpenProjects}><FolderTree size={15} />Проекты</button> : null}
        <button type="button" onClick={() => openOs("plugins")}><Layers size={15} />Плагины</button>
        <button type="button" onClick={() => setToolWorkspace("deep")}><Globe size={15} />Исследование</button>
      </nav> : null}

      <div ref={threadRef} data-message-list className="malik-chat-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-44 pt-6 md:px-8 md:pb-48 lg:px-10">
        <div className="malik-message-list mx-auto flex w-full max-w-[768px] flex-col gap-8 sm:gap-10">
          {messages.length === 0 ? (
            workspaceMode === "work" ? <WorkStartPanel onChoose={(value, research) => {
              setPrompt(value)
              if (research) setResearchMode("deep")
              textareaRef.current?.focus()
            }} /> : projectName ? (
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
              {messages.map((message, index) => (
                <MemoMessageBubble
                  key={message.id}
                  message={message}
                  workspaceMode={workspaceMode}
                  isLatest={index === messages.length - 1}
                  freshTurn={liveTurn && index >= messages.length - 2}
                  // The question this answer replies to. A re-check searches
                  // for the flagged figure inside its own subject, not on its
                  // own — "200 тысяч" alone returns a dictionary.
                  question={
                    message.role === "assistant"
                      ? messages.slice(0, index).reverse().find((item) => item.role === "user")?.content || ""
                      : ""
                  }
                  previousQuestion={message.role === "assistant" ? messages.slice(0, index).filter((item) => item.role === "user").at(-2)?.content || "" : ""}
                  questionHasAttachment={message.role === "assistant" && Boolean(messages.slice(0, index).reverse().find((item) => item.role === "user")?.attachments?.length)}
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
                  onOpenSheet={openSheetFor}
                  onEditPrompt={handleEditPrompt}
                  onFollowUp={handleFollowUp}
                  showFollowUps={
                    index === messages.length - 1
                    && message.role === "assistant"
                    && !message.isStreaming
                    && !isLoading
                    && Boolean(message.content.trim())
                    && !message.generatedMedia
                    && !message.imageConfirmation
                    && !message.superflow
                  }
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div data-composer className="malik-composer-dock relative z-20 w-full shrink-0 bg-transparent px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 md:px-8 md:pb-6 lg:px-10">
        {/* Round "to the newest message" button. It lives in the dock (always
            positioned on every layout) and floats just above it, centred on
            the thread; it only shows once the reader is well above the end. */}
        <button
          type="button"
          className="malik-jump-bottom"
          data-visible={showJumpButton && messages.length > 0 ? "1" : "0"}
          onClick={jumpToNewest}
          aria-label="Прокрутить к последнему сообщению"
          title="К последнему сообщению"
          aria-hidden={!(showJumpButton && messages.length > 0)}
          tabIndex={showJumpButton && messages.length > 0 ? 0 : -1}
        >
          <ArrowDown aria-hidden="true" />
        </button>
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
          {editSourceId ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[11px] text-zinc-300">
              <span><strong className="text-white">Новая ветка</strong> · измените сообщение и отправьте — исходный чат сохранится.</span>
              <button type="button" onClick={() => setEditSourceId(null)} className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label="Отменить создание ветки"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : null}
          {queuedTurn ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-[11px] text-zinc-400">
              <span className="min-w-0 truncate"><strong className="text-white">В очереди:</strong> {queuedTurn.display}</span>
              <button type="button" onClick={() => setQueuedTurn(null)} className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label="Убрать запрос из очереди"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : null}
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
              placeholder={workspaceMode === "work" ? "Опиши задачу и нужный результат…" : "Чем я могу помочь сегодня?"}
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
                {isLoading ? (
                  canStopGeneration ? (
                    <button
                      type="button"
                      onClick={onStopGeneration}
                      className="malik-inline-send"
                      aria-label="Остановить генерацию"
                      title="Остановить генерацию"
                    >
                      <Square className="h-[15px] w-[15px] fill-current" />
                    </button>
                  ) : (
                    <button type="button" disabled className="malik-inline-send" aria-label="Malik AI отвечает">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </button>
                  )
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onOpenVoice}
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
                      disabled={!prompt.trim() && attachments.length === 0}
                      className={cn("malik-inline-send", !prompt.trim() && attachments.length === 0 && "is-hidden")}
                      aria-label="Отправить"
                      aria-hidden={!prompt.trim() && attachments.length === 0}
                      tabIndex={prompt.trim() || attachments.length ? 0 : -1}
                    >
                      <SendHorizontal className="h-5 w-5" />
                    </button>
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="malik-composer-context-row">
            <button
              type="button"
              onClick={() => {
                const next = researchMode === "off" ? "web" : "off"
                setResearchMode(next)
                if (next === "web") focusComposerWith("Найди в сети актуальную информацию по теме: ")
              }}
              className={cn(researchMode !== "off" && "is-active")}
            >
              <Globe className="h-3.5 w-3.5" /> {researchMode === "deep" ? "Глубокое исследование" : researchMode === "web" ? "Веб-поиск включён" : "Веб и источники"}
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
              className="fixed z-[10000] max-h-[72dvh] overflow-x-hidden overflow-y-auto rounded-[22px] border border-white/[0.10] bg-[#1b1b1c]/98 p-2 shadow-[0_24px_80px_rgba(0,0,0,.78)] backdrop-blur-xl"
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
                    onClick={() => {
                      setShowAttachMenu(false)
                      item.action()
                    }}
                    className="group flex min-h-[50px] w-full items-center gap-3 rounded-[15px] px-3 py-1.5 text-left text-white transition-colors hover:bg-white/[0.07] active:bg-white/[0.11]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white">
                      <item.icon className="h-[18px] w-[18px] stroke-[1.8]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[13px] font-semibold leading-5">{item.label}</strong>
                      <small className="block truncate text-[10.5px] font-normal leading-4 text-zinc-500">{item.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          ) : null}
        </div>
        <p className="mt-2 hidden text-center text-xs text-zinc-600 sm:block">Malik AI может ошибаться. Проверяйте важную информацию.</p>
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (event) => { await handleFiles(event.target.files); event.currentTarget.value = "" }} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.docx,.xlsx,.pptx,.txt,.md,.mdx,.csv,.tsv,.json,.jsonl,.yaml,.yml,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.java,.kt,.go,.rs,.rb,.php,.swift,.c,.h,.cpp,.hpp,.cs,.sql,.sh,.bash,.zsh,.ps1,.toml,.ini,.log"
        className="hidden"
        onChange={async (event) => { await handleFiles(event.target.files); event.currentTarget.value = "" }}
      />
      <input
        ref={allInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.docx,.xlsx,.pptx,.txt,.md,.mdx,.csv,.tsv,.json,.jsonl,.yaml,.yml,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.java,.kt,.go,.rs,.rb,.php,.swift,.c,.h,.cpp,.hpp,.cs,.sql,.sh,.bash,.zsh,.ps1,.toml,.ini,.log"
        className="hidden"
        onChange={async (event) => { await handleFiles(event.target.files); event.currentTarget.value = "" }}
      />

      <ChatLibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={async (url) => {
          const ok = await importRemoteMedia(url)
          if (!ok) throw new Error("Не удалось прикрепить файл из библиотеки")
        }}
      />
      <ChatDrawingPad
        open={drawingOpen}
        onClose={() => setDrawingOpen(false)}
        onAttach={async (file) => handleFiles([file])}
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

      {sheet && sheetMessage ? (
        <AnswerSheet
          key={sheet.id}
          content={cleanResearchDisplayText(sheetMessage.content, sheetMessage.research)}
          streaming={Boolean(sheetMessage.isStreaming)}
          request={sheetRequest}
          auto={sheet.auto}
          onClose={closeSheet}
        />
      ) : null}
    </div>
  )
}

export default ChatView
