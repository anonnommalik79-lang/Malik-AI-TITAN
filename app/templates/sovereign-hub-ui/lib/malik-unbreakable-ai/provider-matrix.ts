import type { UnbreakableProvider } from "./types"

export const TEXT_PROVIDERS: UnbreakableProvider[] = [
  { id: "core-fast", title: "MALIK Core Fast", kind: "text", configured: false, priority: 1, fallback: true, timeoutMs: 45000 },
  { id: "core-smart", title: "MALIK Core Smart", kind: "text", configured: false, priority: 2, fallback: true, timeoutMs: 60000 },
  { id: "reasoning", title: "MALIK Reasoning", kind: "text", configured: false, priority: 3, fallback: true, timeoutMs: 60000 },
]

export const MEDIA_PROVIDERS: UnbreakableProvider[] = [
  { id: "cinema-primary", title: "MALIK Cinema", kind: "video", configured: false, priority: 1, fallback: true, timeoutMs: 190000 },
  { id: "cinema-quality", title: "MALIK Cinema Quality", kind: "video", configured: false, priority: 2, fallback: true, timeoutMs: 190000 },
  { id: "cinema-backup", title: "MALIK Cinema Backup", kind: "video", configured: false, priority: 3, fallback: true, timeoutMs: 160000 },
  { id: "render-queue", title: "MALIK Render Queue", kind: "video", configured: false, priority: 4, fallback: true, timeoutMs: 160000 },
]

export function sortProviders(providers: UnbreakableProvider[]) {
  return [...providers].sort((a, b) => a.priority - b.priority)
}

