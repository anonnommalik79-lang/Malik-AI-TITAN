"use client"

import { Crown, ExternalLink, Sparkles } from "lucide-react"

// Replace YOUR_TELEGRAM_USERNAME with owner Telegram username.
export const TELEGRAM_UPGRADE_URL = "https://t.me/YOUR_TELEGRAM_USERNAME"

interface ProUpgradeCardProps {
  title?: string
  description?: string
  compact?: boolean
}

export function openTelegramUpgrade() {
  const opened = window.open(TELEGRAM_UPGRADE_URL, "_blank", "noopener,noreferrer")
  if (!opened) window.location.href = TELEGRAM_UPGRADE_URL
}

export function ProUpgradeCard({
  title = "Бесплатный лимит исчерпан.",
  description = "Для продолжения генерации фото/видео/кода подключите Pro.",
  compact = false,
}: ProUpgradeCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-[2rem] border border-violet-300/20 bg-violet-500/10 text-white shadow-2xl shadow-violet-950/20 ${compact ? "p-4" : "p-6"}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217, 174, 69,.26),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(228, 187, 94,.14),transparent_34%)]" />
      <div className="relative flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-black">
          <Crown className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-100">
            <Sparkles className="h-4 w-4" />
            Pro unlock
          </div>
          <h3 className="mt-2 text-xl font-black">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{description}</p>
          <button
            type="button"
            onClick={openTelegramUpgrade}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-cyan-100"
          >
            Купить Pro в Telegram
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProUpgradeCard

