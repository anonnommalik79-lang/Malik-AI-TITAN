"use client"

import { memo } from "react"
import { LayoutTemplate } from "lucide-react"
import { MalikHybridHome, type MalikHybridHomeProps } from "./hybrid/MalikHybridHome"

/**
 * Keep the entire center workspace on one continuous surface. The home itself
 * and the shell wrapper intentionally share the same background so viewport
 * height changes never expose a darker strip beneath the launcher.
 */
function WelcomeScreenInner(props: MalikHybridHomeProps) {
  return (
    <div className="malik-mobile-home relative isolate flex h-full min-h-0 w-full flex-1 bg-[#0f0f10]">
      {props.onOpenWebsite ? (
        <button
          type="button"
          onClick={props.onOpenWebsite}
          className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-[0_12px_32px_rgba(0,0,0,.28)] transition hover:bg-zinc-100 active:scale-[.98] md:top-5"
          aria-label="Открыть раздел Сайты"
        >
          <LayoutTemplate size={17} aria-hidden="true" />
          <span>Сайты</span>
        </button>
      ) : null}
      <MalikHybridHome {...props} />
    </div>
  )
}

export const WelcomeScreen = memo(WelcomeScreenInner)
export default WelcomeScreen
