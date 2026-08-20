"use client"

import { Code2, Film, Image as ImageIcon, LayoutTemplate, Loader2, Sparkles } from "lucide-react"

export type MediaGenerationKind = "image" | "video" | "code" | "website"
export type MediaGenerationStatus = "idle" | "generating" | "done" | "error" | "limited"

export type MediaGenerationPlaceholderProps = {
  kind: MediaGenerationKind
  status?: MediaGenerationStatus
  src?: string
  title?: string
  subtitle?: string
  onRetry?: () => void
}

const defaultCopy: Record<MediaGenerationKind, { title: string; subtitle: string }> = {
  image: {
    title: "Создаю изображение...",
    subtitle: "Генерируется более детализированное изображение, подождите немного.",
  },
  video: {
    title: "Создаю видео...",
    subtitle: "Собираю сцены, движение камеры, свет и кадры.",
  },
  code: {
    title: "Собираю код...",
    subtitle: "Планирую файлы, компоненты и архитектуру.",
  },
  website: {
    title: "Строю интерфейс...",
    subtitle: "Собираю hero, sections, cards, адаптив и анимации.",
  },
}

const icons = {
  image: ImageIcon,
  video: Film,
  code: Code2,
  website: LayoutTemplate,
}

export function MediaGenerationPlaceholder({
  kind,
  status = "idle",
  src,
  title,
  subtitle,
  onRetry,
}: MediaGenerationPlaceholderProps) {
  const Icon = icons[kind]
  const copy = defaultCopy[kind]
  const isVideo = kind === "video"
  const isDoneWithSrc = status === "done" && Boolean(src)

  return (
    <div className="w-full max-w-full text-white">
      <div className="mb-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-100">
          {status === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {status}
        </div>
        <h3 className="mt-3 text-xl font-black sm:text-2xl">{title || copy.title}</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">{subtitle || copy.subtitle}</p>
      </div>

      <div
        className={`relative mx-auto max-w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.05] shadow-2xl shadow-black/30 backdrop-blur-xl ${
          isVideo ? "aspect-video w-full max-w-3xl" : "aspect-square w-full max-w-[480px]"
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217, 174, 69,.20),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(228, 187, 94,.14),transparent_36%)]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="absolute inset-y-0 left-[-40%] w-1/2 skew-x-[-12deg] bg-gradient-to-r from-transparent via-white/10 to-transparent blur-sm animate-shimmer" />
        <div className="absolute inset-x-8 top-1/3 h-24 rounded-full bg-cyan-300/10 blur-3xl" />

        {isDoneWithSrc && kind === "image" ? (
          <img src={src} alt="Generated image" className="relative h-full w-full scale-100 object-cover opacity-100 blur-0 transition duration-700" />
        ) : isDoneWithSrc && kind === "video" ? (
          <video src={src} controls className="relative h-full w-full object-cover" />
        ) : status === "error" ? (
          <div className="relative flex h-full items-center justify-center p-6 text-center">
            <div>
              <Icon className="mx-auto h-12 w-12 text-amber-100" />
              <p className="mt-4 font-black text-amber-100">
                {kind === "video" ? "Видео runtime сейчас недоступен. Создан storyboard fallback." : "Изображение не создано. Попробуйте ещё раз немного позже."}
              </p>
              {onRetry && (
                <button type="button" onClick={onRetry} className="mt-5 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black">
                  Retry
                </button>
              )}
            </div>
          </div>
        ) : kind === "video" ? (
          <VideoStoryboard />
        ) : kind === "code" ? (
          <CodeSkeleton />
        ) : kind === "website" ? (
          <WebsiteSkeleton />
        ) : (
          <ImageParticles />
        )}
      </div>
    </div>
  )
}

function ImageParticles() {
  return (
    <div className="relative h-full p-8">
      <div className="absolute left-1/4 top-1/4 h-3 w-3 rounded-full bg-cyan-200/70 shadow-[0_0_24px_rgba(240, 210, 136,.7)] animate-pulse" />
      <div className="absolute right-1/4 top-1/3 h-2 w-2 rounded-full bg-violet-200/70 shadow-[0_0_24px_rgba(243, 222, 150,.7)] animate-bounce" />
      <div className="absolute bottom-1/4 left-1/3 h-2.5 w-2.5 rounded-full bg-fuchsia-200/60 animate-pulse" />
      <div className="grid h-full place-items-center">
        <ImageIcon className="h-16 w-16 text-white/30" />
      </div>
    </div>
  )
}

function VideoStoryboard() {
  return (
    <div className="relative h-full p-4 sm:p-5">
      <div className="grid h-full grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.06]">
            <div className="m-2 h-2 rounded-full bg-white/15 sm:m-3 sm:h-3" />
            <div className="mx-2 h-8 rounded-xl bg-cyan-300/10 sm:mx-3 sm:h-10" />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-6 bottom-6 h-2 rounded-full bg-white/10">
        <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 animate-pulse" />
      </div>
    </div>
  )
}

function CodeSkeleton() {
  return (
    <div className="relative grid h-full grid-cols-[96px_1fr] gap-3 p-4 font-mono text-xs sm:grid-cols-[120px_1fr] sm:gap-4 sm:p-5">
      <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
        {["app", "components", "lib", "api", "styles"].map((item) => (
          <div key={item} className="mb-3 h-3 rounded-full bg-white/15" />
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="mb-3 h-3 rounded-full bg-gradient-to-r from-cyan-200/35 to-transparent" style={{ width: `${92 - index * 5}%` }} />
        ))}
      </div>
    </div>
  )
}

function WebsiteSkeleton() {
  return (
    <div className="relative h-full p-5 sm:p-6">
      <div className="mb-4 h-10 rounded-2xl bg-white/10" />
      <div className="mb-4 h-28 rounded-[1.5rem] bg-gradient-to-br from-violet-400/15 to-cyan-300/10" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-24 rounded-2xl bg-white/10" />
        <div className="h-24 rounded-2xl bg-white/10" />
        <div className="h-24 rounded-2xl bg-white/10" />
      </div>
    </div>
  )
}

export default MediaGenerationPlaceholder

