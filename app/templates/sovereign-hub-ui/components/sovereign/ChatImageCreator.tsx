"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Image as ImageIcon, Plus, SendHorizontal, Sparkles, Wand2, X } from "lucide-react"

export type ChatImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:5" | "4:3"
export type ChatImageResolution = "1K" | "2K" | "4K"

type CreatorAttachment = {
  id: string
  name: string
  mime: string
  kind: string
  url?: string
  base64?: string
}

type CreditSnapshot = {
  remaining: number
  daily: number
  costs: Record<ChatImageResolution, number>
  remaining4k: number
}

type ImageTemplate = {
  id: string
  label: string
  prompt: string
  background: string
  badge?: string
}

const TEMPLATES: ImageTemplate[] = [
  { id: "retro-80", label: "Назад в 80-е", prompt: "1980s analog photography, vintage street fashion, warm film grain, period-accurate colors, candid flash photography", background: "linear-gradient(135deg,#79503d 0%,#d27c55 38%,#254a5b 100%)" },
  { id: "glam-80", label: "Глэм 80-х", prompt: "luxury 1980s glamour portrait, glossy magazine lighting, rich jewel tones, soft cinematic skin, premium editorial photography", background: "linear-gradient(135deg,#211016 0%,#7c243d 48%,#d39a6d 100%)", badge: "Фото" },
  { id: "vacation-80", label: "Отпуск в 80-х", prompt: "sunny 1980s travel photography, Mediterranean vacation mood, vintage film stock, authentic retro wardrobe, natural sunlight", background: "linear-gradient(135deg,#51b8d9 0%,#f4d28a 48%,#bc664a 100%)" },
  { id: "disco-80", label: "Диско 80-х", prompt: "1980s disco nightclub, colorful spotlights, energetic dance floor, glamorous fashion, flash photography, cinematic motion", background: "linear-gradient(135deg,#25002f 0%,#d52574 44%,#f7b33d 100%)" },
  { id: "monochrome", label: "Монохром", prompt: "timeless black and white portrait, deep contrast, sculpted studio lighting, fine-art photography, subtle film grain", background: "linear-gradient(135deg,#050505 0%,#555 45%,#111 100%)" },
  { id: "color-block", label: "Колор-блок", prompt: "bold color-block editorial set, geometric architecture, saturated clean colors, fashion campaign lighting, crisp composition", background: "linear-gradient(135deg,#00a6c8 0 42%,#f2c7cf 42% 68%,#ba3a31 68%)" },
  { id: "podium", label: "Подиум", prompt: "high-fashion runway portrait, dramatic gradient studio lighting, minimalist stage, premium editorial look, full-body composition", background: "linear-gradient(135deg,#192d65 0%,#8f5e8f 50%,#d6a25f 100%)" },
  { id: "technicolor", label: "Техниколор", prompt: "technicolor portrait, bold geometric shadows, saturated complementary colors, retro-futurist editorial photography", background: "linear-gradient(120deg,#04a0ad 0 25%,#f6c221 25% 50%,#ec4b47 50% 75%,#792a7d 75%)" },
  { id: "gothic", label: "Готика", prompt: "ornate gothic fantasy interior, dramatic candlelight, dark carved architecture, intricate detail, cinematic character portrait", background: "linear-gradient(135deg,#19120f 0%,#6b401f 45%,#202731 100%)" },
  { id: "dynamite", label: "Динамит", prompt: "high-impact action portrait, controlled cinematic explosion in background, flying sparks, sharp subject separation, blockbuster lighting", background: "radial-gradient(circle at 65% 38%,#ffb11a 0 7%,#d74715 20%,#1a2027 48%,#060606 100%)" },
  { id: "salon", label: "Салон", prompt: "minimal luxury salon portrait, clean architectural backdrop, soft diffused studio light, natural skin texture, premium fashion campaign", background: "linear-gradient(135deg,#b8aca2 0%,#6b5c58 52%,#272323 100%)" },
  { id: "sketch", label: "Эскиз", prompt: "hand-drawn graphite pencil sketch on textured cream paper, refined linework, realistic shading, artist study, elegant unfinished details", background: "linear-gradient(135deg,#eee6d5 0%,#c9b78c 100%)" },
  { id: "cinema", label: "Киноэффект", prompt: "dark cinematic still, moody practical lighting, deep shadows, anamorphic atmosphere, subtle haze, premium film color grading", background: "linear-gradient(135deg,#06131b 0%,#1b3b4b 35%,#9a5c2c 100%)" },
  { id: "steampunk", label: "Стимпанк", prompt: "epic steampunk city, brass machinery, Victorian industrial architecture, warm sunset haze, cinematic adventure concept art", background: "linear-gradient(135deg,#3f2614 0%,#a36d2f 46%,#2b3031 100%)" },
  { id: "sunrise", label: "Восход", prompt: "golden sunrise landscape, soft atmospheric haze, cinematic lens flare, serene wide composition, photorealistic natural light", background: "linear-gradient(180deg,#7fb8e8 0%,#f4c66c 55%,#4a4b25 100%)" },
  { id: "mythic", label: "Мифический боец", prompt: "mythic warrior duel in an icy mountain storm, epic scale, dramatic blue light, flying snow, premium fantasy key art", background: "linear-gradient(135deg,#1b3148 0%,#6688a3 52%,#d6e6f0 100%)" },
  { id: "surreal", label: "Сюрреализм", prompt: "surreal fine-art portrait, dreamlike environment, impossible geometry, elegant symbolism, museum-grade editorial finish", background: "linear-gradient(135deg,#d6b66e 0%,#547f7d 45%,#9a5a55 100%)" },
  { id: "night-room", label: "Мрак", prompt: "dark luxury interior at night, rain-lit window, cinematic blue practical light, deep shadows, quiet dramatic atmosphere", background: "linear-gradient(135deg,#060708 0%,#152c3c 55%,#74421f 100%)" },
  { id: "cyborg", label: "Киборг", prompt: "photorealistic humanoid cyborg, exposed precision mechanics, red sensor glow, advanced robotics lab, cinematic sci-fi lighting", background: "linear-gradient(135deg,#10161b 0%,#505b62 52%,#8b171c 100%)" },
  { id: "luxury", label: "Люкс", prompt: "ultra-premium luxury campaign, polished materials, controlled highlights, deep black background, high-end advertising photography", background: "linear-gradient(135deg,#050505 0%,#4b3d28 46%,#d2b26b 100%)" },
]

const RATIOS: ChatImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:5", "4:3"]
const SIZES: ChatImageResolution[] = ["1K", "2K", "4K"]

function previewUrl(item: CreatorAttachment) {
  if (item.url) return item.url
  if (item.base64 && item.mime.startsWith("image/")) return `data:${item.mime};base64,${item.base64}`
  return ""
}

export function ChatImageCreator({
  attachments,
  credits,
  busy = false,
  onAddImage,
  onRemoveAttachment,
  onClose,
  onGenerate,
}: {
  attachments: CreatorAttachment[]
  credits?: CreditSnapshot | null
  busy?: boolean
  onAddImage: () => void
  onRemoveAttachment: (id: string) => void
  onClose: () => void
  onGenerate: (input: {
    prompt: string
    style?: string
    aspectRatio: ChatImageAspectRatio
    imageSize: ChatImageResolution
  }) => void
}) {
  const [prompt, setPrompt] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [aspectRatio, setAspectRatio] = useState<ChatImageAspectRatio>("1:1")
  const [imageSize, setImageSize] = useState<ChatImageResolution>("1K")

  const selected = useMemo(() => TEMPLATES.find((item) => item.id === selectedId) || null, [selectedId])
  const imageAttachments = attachments.filter((item) => item.kind === "image" || item.mime.startsWith("image/"))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const generate = () => {
    const clean = prompt.trim()
    if (!clean || busy) return
    onGenerate({
      prompt: clean,
      style: selected?.prompt,
      aspectRatio,
      imageSize,
    })
  }

  return (
    <section className="absolute inset-0 z-[90] flex min-h-0 flex-col overflow-hidden bg-[#0b0b0c] text-white" aria-label="Создание изображений">
      <header className="relative z-10 shrink-0 border-b border-white/[0.05] bg-[#0b0b0c]/96 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-[930px] items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-yellow-300/25 bg-yellow-300/[0.08] text-yellow-300">
            <Wand2 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-zinc-100 sm:text-[28px]">Создание изображений</h2>
            <p className="mt-0.5 text-[12px] text-zinc-500 sm:text-[13px]">Выберите стиль или опишите идею. Генерация идёт через MalikImage.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition hover:bg-white/[0.08] hover:text-white" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[310px] pt-5 sm:px-6 sm:pb-[260px]">
        <div className="mx-auto w-full max-w-[930px]">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {TEMPLATES.map((item) => {
              const active = item.id === selectedId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId((current) => current === item.id ? null : item.id)}
                  className={`group relative aspect-[1.16/1] overflow-hidden rounded-[22px] border text-left transition duration-200 ${active ? "border-white/70 ring-2 ring-white/25" : "border-white/[0.07] hover:border-white/20"}`}
                  aria-pressed={active}
                >
                  <span className="absolute inset-0 transition duration-300 group-hover:scale-[1.03]" style={{ background: item.background }} />
                  <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(0,0,0,.78)_100%)]" />
                  <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/25 text-white/85 backdrop-blur-md">
                    {active ? <Check className="h-4 w-4" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </span>
                  {item.badge ? <span className="absolute right-3 top-3 rounded-full bg-black/35 px-2 py-1 text-[9px] font-semibold text-white/80 backdrop-blur-md">{item.badge}</span> : null}
                  <span className="absolute inset-x-3 bottom-3 text-[12px] font-semibold leading-4 text-white drop-shadow sm:text-[13px]">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(10px,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
        <div className="mx-auto w-full max-w-[760px] rounded-[26px] border border-white/[0.08] bg-[#202022]/95 p-3 shadow-[0_28px_90px_rgba(0,0,0,.72)] backdrop-blur-2xl sm:p-4">
          <div className="mb-2 flex min-h-10 items-center gap-2 overflow-x-auto">
            {selected ? (
              <button type="button" onClick={() => setSelectedId(null)} className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/25 px-2.5 text-[11px] font-semibold text-zinc-200">
                <span className="h-7 w-7 rounded-lg" style={{ background: selected.background }} />
                <span>{selected.label}</span>
                <X className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            ) : null}
            {imageAttachments.slice(0, 3).map((item) => {
              const src = previewUrl(item)
              return (
                <div key={item.id} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
                  {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="absolute inset-0 m-auto h-4 w-4 text-zinc-500" />}
                  <button type="button" onClick={() => onRemoveAttachment(item.id)} className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/75 text-white" aria-label="Убрать фото">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )
            })}
          </div>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                generate()
              }
            }}
            rows={2}
            placeholder={selected ? `Опишите, что создать в стиле «${selected.label}»` : "Опишите изображение"}
            className="max-h-28 min-h-[58px] w-full resize-none bg-transparent px-1 text-[15px] leading-6 text-white outline-none placeholder:text-zinc-500"
          />

          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={onAddImage} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[0.08] hover:text-white" aria-label="Добавить изображение">
              <Plus className="h-5 w-5" />
            </button>
            <button type="button" onClick={onAddImage} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/[0.09] px-3 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.13]">
              <ImageIcon className="h-4 w-4" /> Изображения
            </button>
            <div className="ml-auto flex items-center gap-1">
              {SIZES.map((size) => {
                const cost = credits?.costs?.[size] ?? (size === "1K" ? 1 : size === "2K" ? 2 : 5)
                const blocked = Boolean(credits && (credits.remaining < cost || (size === "4K" && credits.remaining4k <= 0)))
                return (
                  <button
                    key={size}
                    type="button"
                    disabled={blocked}
                    onClick={() => setImageSize(size)}
                    className={`h-8 rounded-lg px-2.5 text-[11px] font-semibold transition ${imageSize === size ? "bg-white text-black" : "bg-white/[0.06] text-zinc-400 hover:text-white"} disabled:cursor-not-allowed disabled:opacity-25`}
                    title={`${size} · ${cost} кр.`}
                  >
                    {size}
                  </button>
                )
              })}
              <button type="button" onClick={generate} disabled={!prompt.trim() || busy} className="ml-1 grid h-10 w-10 place-items-center rounded-full bg-white text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-25" aria-label="Сгенерировать">
                <SendHorizontal className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto border-t border-white/[0.06] pt-3">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Соотношение</span>
            {RATIOS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`h-7 shrink-0 rounded-full px-2.5 text-[10px] font-semibold transition ${aspectRatio === ratio ? "bg-white/[0.14] text-white" : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"}`}
              >
                {ratio}
              </button>
            ))}
            <span className="ml-auto shrink-0 text-[10px] text-zinc-600">
              {credits ? `${credits.remaining > 1_000_000 ? "∞" : credits.remaining} кр.` : "кредиты…"}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ChatImageCreator
