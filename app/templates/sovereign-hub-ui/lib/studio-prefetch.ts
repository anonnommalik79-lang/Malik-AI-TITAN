import { scheduleIdle } from "@/lib/perf-scheduler"

let prefetched = false
let chatPrefetched = false

/** Warm the chat shell immediately so welcome → chat feels instant. */
export function prefetchChatShell(): void {
  if (chatPrefetched || typeof window === "undefined") return
  chatPrefetched = true
  void import("@/components/sovereign/chat-view").catch(() => undefined)
  void import("@/components/sovereign/header").catch(() => undefined)
}

const STUDIO_IMPORTS = [
  () => import("@/components/sovereign/photo-generation/PhotoGenerationStudio"),
  () => import("@/components/sovereign/video-generation/VideoGenerationStudio"),
  () => import("@/components/sovereign/website-generation/WebsiteGenerationStudio"),
  () => import("@/components/sovereign/command-center/CommandCenterStudio"),
  () => import("@/components/sovereign/business/BusinessCommandCenter"),
  () => import("@/components/sovereign/ai-generator/AIGeneratorStudio"),
  () => import("@/components/sovereign/final-intelligence/FinalIntelligenceLab"),
  () => import("@/components/sovereign/unbreakable/UnbreakableShield"),
  () => import("@/components/sovereign/digital-bridge-sections"),
  () => import("@/components/AnimatedAIBackground"),
  () => import("@/components/sovereign/digital-bridge-demo-polish"),
] as const

/**
 * Phones pay for this twice: the download itself on a metered connection, and
 * the parse/compile of eleven studio chunks on a slower CPU. Touch devices get
 * the chat shell only; the studio chunk still loads on demand when opened.
 */
function shouldPrefetchStudios(): boolean {
  try {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return false
    if (window.matchMedia("(pointer: coarse)").matches) return false
  } catch {
    /* matchMedia can be unavailable in exotic webviews — fall through to true */
  }
  return true
}

export function prefetchStudioChunks(): void {
  if (typeof window === "undefined") return
  prefetchChatShell()

  if (prefetched) return
  if (!shouldPrefetchStudios()) return
  prefetched = true

  scheduleIdle(() => {
    STUDIO_IMPORTS.forEach((load, index) => {
      window.setTimeout(() => {
        void load().catch(() => undefined)
      }, index * 90)
    })
  }, 500)
}
