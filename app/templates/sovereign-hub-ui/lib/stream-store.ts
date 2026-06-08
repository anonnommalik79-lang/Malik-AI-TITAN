import type { ThinkingStep } from "@/lib/ai/safe-thinking"

export type StreamSnapshot = {
  messageId: string | null
  text: string
  active: boolean
  thinkingLabel: string
  thinkingSteps: ThinkingStep[]
  providerUsed: string
  safeMode: boolean
  fallbackUsed: boolean
}

export type ThinkingView = {
  label: string
  steps: ThinkingStep[]
  providerUsed: string
  safeMode: boolean
  fallbackUsed: boolean
}

let snapshot: StreamSnapshot = {
  messageId: null,
  text: "",
  active: false,
  thinkingLabel: "",
  thinkingSteps: [],
  providerUsed: "",
  safeMode: false,
  fallbackUsed: false,
}
const listeners = new Set<() => void>()

/** Stable object for useSyncExternalStore — must not allocate on every getSnapshot call. */
let thinkingViewCache: ThinkingView | null = null

function syncThinkingViewCache() {
  if (!snapshot.active || !snapshot.messageId) {
    thinkingViewCache = null
    return
  }

  thinkingViewCache = {
    label: snapshot.thinkingLabel,
    steps: snapshot.thinkingSteps,
    providerUsed: snapshot.providerUsed,
    safeMode: snapshot.safeMode,
    fallbackUsed: snapshot.fallbackUsed,
  }
}

function emit() {
  syncThinkingViewCache()
  listeners.forEach((listener) => listener())
}

function syncStreamingAttr(active: boolean) {
  if (typeof document === "undefined") return
  const root = document.getElementById("malik-root")
  if (!root) return
  if (active) root.setAttribute("data-streaming", "true")
  else root.removeAttribute("data-streaming")
}

export function getStreamSnapshot(): StreamSnapshot {
  return snapshot
}

export function subscribeStream(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getStreamTextForMessage(messageId: string): string | null {
  if (snapshot.messageId !== messageId || !snapshot.active) return null
  return snapshot.text
}

export function getThinkingForMessage(messageId: string): ThinkingView | null {
  if (snapshot.messageId !== messageId || !snapshot.active) return null
  if (!thinkingViewCache) syncThinkingViewCache()
  return thinkingViewCache
}

export const streamStore = {
  begin(messageId: string) {
    thinkingViewCache = null
    snapshot = { messageId, text: "", active: true, thinkingLabel: "Запрос получен", thinkingSteps: [], providerUsed: "", safeMode: false, fallbackUsed: false }
    syncStreamingAttr(true)
    emit()
  },
  updateThinking(messageId: string, input: Partial<Pick<StreamSnapshot, "thinkingLabel" | "thinkingSteps" | "providerUsed" | "safeMode" | "fallbackUsed">>) {
    if (snapshot.messageId !== messageId || !snapshot.active) return
    snapshot = { ...snapshot, ...input }
    emit()
  },
  update(text: string, messageId: string) {
    if (snapshot.messageId !== messageId || !snapshot.active) return
    snapshot = { ...snapshot, text }
    emit()
  },
  end() {
    thinkingViewCache = null
    snapshot = { messageId: null, text: "", active: false, thinkingLabel: "", thinkingSteps: [], providerUsed: "", safeMode: false, fallbackUsed: false }
    syncStreamingAttr(false)
    emit()
  },
  getSnapshot: getStreamSnapshot,
  subscribe: subscribeStream,
}
