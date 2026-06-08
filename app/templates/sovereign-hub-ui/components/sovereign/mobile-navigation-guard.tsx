"use client"

import { ArrowLeft, Home, X } from "lucide-react"

export type MobileNavigationGuardProps = {
  title?: string
  canGoBack?: boolean
  showClose?: boolean
  onBack?: () => void
  onHome?: () => void
  onClose?: () => void
}

export function MobileNavigationGuard({
  title = "Malik AI",
  canGoBack = true,
  showClose = false,
  onBack,
  onHome,
  onClose,
}: MobileNavigationGuardProps) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/80 px-3 py-2 pt-[max(env(safe-area-inset-top),8px)] text-white backdrop-blur-2xl md:hidden">
      <div className="flex items-center gap-2">
        {canGoBack && (
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black">
            <ArrowLeft className="h-4 w-4" />
            Назад
          </button>
        )}
        <button type="button" onClick={onHome} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-black text-black">
          <Home className="h-4 w-4" />
          Домой
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-black text-zinc-300">{title}</div>
        {showClose && (
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export default MobileNavigationGuard

