"use client"

import type { ComponentType } from "react"
import { Brain, Code2, FileText, FolderTree, Image, LayoutTemplate, Loader2, Sparkles, Video } from "lucide-react"
import { MediaGenerationPlaceholder } from "./media-generation-placeholder"

export type GenerationStatusType = "text" | "image" | "video" | "file" | "code" | "website" | "codex"
export type GenerationKind = GenerationStatusType

export interface GenerationStatusProps {
  kind?: GenerationKind
  type?: GenerationStatusType
  label?: string
  compact?: boolean
  className?: string
}

const statusCopy: Record<GenerationStatusType, { title: string; detail: string }> = {
  text: { title: "Думаю...", detail: "Формирую лучший ответ." },
  image: { title: "Создаю изображение...", detail: "Malik AI строит визуал, стиль и детали." },
  video: { title: "Создаю видео...", detail: "Генерирую сцены, движение камеры и кадры." },
  file: { title: "Читаю файл...", detail: "Извлекаю смысл, структуру и важные данные." },
  code: { title: "Собираю код...", detail: "Планирую файлы, компоненты и архитектуру." },
  website: { title: "Строю интерфейс...", detail: "Собираю hero, sections, cards, адаптив и анимации." },
  codex: { title: "Планирую файлы...", detail: "Готовлю структуру проекта как в Codex." },
}

const statusIcon: Record<GenerationStatusType, ComponentType<{ className?: string }>> = {
  text: Brain,
  image: Image,
  video: Video,
  file: FileText,
  code: Code2,
  website: LayoutTemplate,
  codex: FolderTree,
}

export function GenerationStatus({
  kind,
  type = "text",
  label,
  compact = false,
  className = "",
}: GenerationStatusProps) {
  const resolvedType = kind || type
  const Icon = statusIcon[resolvedType]
  const copy = statusCopy[resolvedType]

  if (compact) {
    return (
      <div className={`inline-flex max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-left ${className}`}>
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-100">
          <Icon className="h-4 w-4" />
          <span className="absolute inset-0 rounded-xl border border-violet-300/30 animate-ping" />
        </span>
        <span className="min-w-0">
          <span className="block font-black text-white">{label || copy.title}</span>
          <span className="block truncate text-xs text-zinc-500">{copy.detail}</span>
        </span>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-200" />
      </div>
    )
  }

  if (resolvedType === "image" || resolvedType === "video" || resolvedType === "code" || resolvedType === "website") {
    return (
      <MediaGenerationPlaceholder
        kind={resolvedType}
        status="generating"
        title={label || copy.title}
        subtitle={copy.detail}
      />
    )
  }

  return (
    <div className={`relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#07070a] p-4 text-white ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,.14),transparent_34%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-violet-400 via-cyan-300 to-fuchsia-400" />
      <div className="relative flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
          <Icon className="h-6 w-6 animate-pulse" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-black">{label || copy.title}</h3>
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-200" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-200 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fuchsia-200 [animation-delay:240ms]" />
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{copy.detail}</p>
        </div>
        <Sparkles className="hidden h-5 w-5 text-violet-200 sm:block" />
      </div>

      <div className="relative mt-4 grid gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-cyan-300 to-fuchsia-400"
              style={{ width: `${86 - index * 12}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default GenerationStatus

