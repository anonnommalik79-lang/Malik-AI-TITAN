"use client"

import { useLayoutEffect, type ReactNode } from "react"

const DASHBOARD_STORAGE_KEY = "malik_dashboard_state_v3"
const ACCOUNT_PREFIX = `${DASHBOARD_STORAGE_KEY}:account:`
const MIGRATION_MARKER = `${DASHBOARD_STORAGE_KEY}:account-migrated-v1`
const BACKGROUND_TURN_PREFIX = "malik_background_chat_turns_v1:"
const BACKGROUND_STREAM_PATH = "/api/stream/background"
const CHAT_STREAM_PATH = "/api/stream"
const MAX_PENDING_TURNS = 40
const RECOVERY_POLL_MS = 1600
const MAX_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000

type PendingBackgroundTurn = {
  turnId: string
  prompt: string
  chatId?: string
  assistantMessageId?: string
  createdAt: number
  pageId: string
  detached?: boolean
}

type BackgroundTurnResult = {
  status?: "pending" | "complete" | "failed"
  content?: string
  error?: string
  provider?: string
  model?: string
  completedAt?: string
}

type BackgroundRuntime = {
  pageId: string
  currentAccountKey: string
  baseFetch: typeof window.fetch
  rawGetItem: typeof Storage.prototype.getItem
  rawSetItem: typeof Storage.prototype.setItem
  rawRemoveItem: typeof Storage.prototype.removeItem
  originalAbort: typeof AbortController.prototype.abort
  patchedAbort: typeof AbortController.prototype.abort
  protectedChatSignals: WeakSet<AbortSignal>
  latestController: AbortController | null
  latestTurnId: string
  latestAccountKey: string
  reloadScheduled: boolean
  recoveryTimers: Map<string, number>
}

function cleanAccountId(value: string) {
  return encodeURIComponent(String(value || "guest").trim().toLowerCase() || "guest")
}

function requestPath(input: RequestInfo | URL) {
  try {
    const raw = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
    return new URL(raw, window.location.href).pathname
  } catch {
    return ""
  }
}

function requestUrl(input: RequestInfo | URL) {
  try {
    const raw = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
    return new URL(raw, window.location.href)
  } catch {
    return new URL(CHAT_STREAM_PATH, window.location.href)
  }
}

function incomingSignal(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.signal) return init.signal
  return typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined
}

function parsePrompt(init?: RequestInit) {
  if (typeof init?.body !== "string") return ""
  try {
    const body = JSON.parse(init.body)
    return String(body?.originalQuestion || body?.prompt || body?.message || body?.question || "").trim().slice(0, 8000)
  } catch {
    return ""
  }
}

function normalizedPrompt(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase()
    .slice(0, 1200)
}

function scopedDashboardKey(accountKey: string) {
  return `${ACCOUNT_PREFIX}${accountKey}`
}

function pendingStorageKey(accountKey: string) {
  return `${BACKGROUND_TURN_PREFIX}${accountKey}`
}

function readPending(runtime: BackgroundRuntime, accountKey: string): PendingBackgroundTurn[] {
  try {
    const raw = runtime.rawGetItem.call(window.localStorage, pendingStorageKey(accountKey))
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed
      .filter((item): item is PendingBackgroundTurn => Boolean(item && typeof item.turnId === "string" && typeof item.createdAt === "number"))
      .filter((item) => now - item.createdAt < MAX_RECOVERY_AGE_MS)
      .slice(-MAX_PENDING_TURNS)
  } catch {
    return []
  }
}

function writePending(runtime: BackgroundRuntime, accountKey: string, turns: PendingBackgroundTurn[]) {
  try {
    runtime.rawSetItem.call(
      window.localStorage,
      pendingStorageKey(accountKey),
      JSON.stringify(turns.slice(-MAX_PENDING_TURNS)),
    )
  } catch {
    // Dashboard history is still authoritative if the browser quota is full.
  }
}

function upsertPending(runtime: BackgroundRuntime, accountKey: string, turn: PendingBackgroundTurn) {
  const current = readPending(runtime, accountKey)
  const next = [...current.filter((item) => item.turnId !== turn.turnId), turn]
  writePending(runtime, accountKey, next)
}

function removePending(runtime: BackgroundRuntime, accountKey: string, turnId: string) {
  const next = readPending(runtime, accountKey).filter((item) => item.turnId !== turnId)
  writePending(runtime, accountKey, next)
}

function markAccountDetached(runtime: BackgroundRuntime, accountKey: string) {
  const current = readPending(runtime, accountKey)
  if (!current.length) return
  writePending(runtime, accountKey, current.map((item) => ({ ...item, detached: true })))
}

function findTurnLocation(runtime: BackgroundRuntime, accountKey: string, turn: PendingBackgroundTurn) {
  if (turn.chatId && turn.assistantMessageId) return turn

  try {
    const raw = runtime.rawGetItem.call(window.localStorage, scopedDashboardKey(accountKey))
    if (!raw) return turn
    const state = JSON.parse(raw)
    const chats = Array.isArray(state?.chats) ? state.chats : []
    const wanted = normalizedPrompt(turn.prompt)

    let best: { score: number; chatId: string; assistantMessageId: string } | null = null
    for (const chat of chats) {
      const messages = Array.isArray(chat?.messages) ? chat.messages : []
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const assistant = messages[index]
        if (assistant?.role !== "assistant" || !assistant?.isStreaming || !assistant?.id) continue
        const previous = messages[index - 1]
        const previousPrompt = previous?.role === "user" ? normalizedPrompt(previous.content) : ""
        let score = 1
        if (wanted && previousPrompt && (wanted === previousPrompt || wanted.includes(previousPrompt) || previousPrompt.includes(wanted))) score += 100
        if (chat?.id && state?.activeChatId === chat.id) score += 10
        if (!best || score > best.score) {
          best = { score, chatId: String(chat.id), assistantMessageId: String(assistant.id) }
        }
      }
    }

    if (!best) return turn
    return { ...turn, chatId: best.chatId, assistantMessageId: best.assistantMessageId }
  } catch {
    return turn
  }
}

function scheduleTurnLocationCapture(runtime: BackgroundRuntime, accountKey: string, turnId: string) {
  const delays = [0, 60, 180, 500, 1200, 2500]
  for (const delay of delays) {
    window.setTimeout(() => {
      const current = readPending(runtime, accountKey).find((item) => item.turnId === turnId)
      if (!current || (current.chatId && current.assistantMessageId)) return
      const mapped = findTurnLocation(runtime, accountKey, current)
      if (mapped.chatId && mapped.assistantMessageId) upsertPending(runtime, accountKey, mapped)
    }, delay)
  }
}

function patchRecoveredTurn(
  runtime: BackgroundRuntime,
  accountKey: string,
  turn: PendingBackgroundTurn,
  result: BackgroundTurnResult,
) {
  const mapped = findTurnLocation(runtime, accountKey, turn)
  if (!mapped.chatId || !mapped.assistantMessageId) return false

  try {
    const key = scopedDashboardKey(accountKey)
    const raw = runtime.rawGetItem.call(window.localStorage, key)
    if (!raw) return false
    const state = JSON.parse(raw)
    const content = result.status === "complete"
      ? String(result.content || "").trim()
      : String(result.error || "Malik AI не смог завершить фоновый ответ.").trim()
    if (!content) return false

    const patchMessage = (message: any) => message?.id === mapped.assistantMessageId
      ? {
          ...message,
          content,
          isStreaming: false,
          backgroundRecovered: true,
          ...(result.model ? { modelId: result.model } : {}),
        }
      : message

    if (Array.isArray(state?.chats)) {
      state.chats = state.chats.map((chat: any) => chat?.id === mapped.chatId
        ? { ...chat, messages: Array.isArray(chat.messages) ? chat.messages.map(patchMessage) : chat.messages }
        : chat)
    }
    if (Array.isArray(state?.messages)) state.messages = state.messages.map(patchMessage)

    runtime.rawSetItem.call(window.localStorage, key, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function scheduleRecoveryReload(runtime: BackgroundRuntime) {
  if (runtime.reloadScheduled) return
  if (!/\/(?:dashboard|compute)(?:\/|$)/.test(window.location.pathname)) return
  runtime.reloadScheduled = true
  window.setTimeout(() => window.location.reload(), 650)
}

function pollDetachedTurn(runtime: BackgroundRuntime, accountKey: string, turnId: string) {
  const timerKey = `${accountKey}:${turnId}`
  if (runtime.recoveryTimers.has(timerKey)) return

  const poll = async () => {
    runtime.recoveryTimers.delete(timerKey)
    const pending = readPending(runtime, accountKey).find((item) => item.turnId === turnId)
    if (!pending || (!pending.detached && pending.pageId === runtime.pageId)) return

    try {
      const response = await runtime.baseFetch(`${BACKGROUND_STREAM_PATH}/${encodeURIComponent(turnId)}`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      if (response.status === 404) {
        if (Date.now() - pending.createdAt < 30_000) {
          const id = window.setTimeout(poll, RECOVERY_POLL_MS)
          runtime.recoveryTimers.set(timerKey, id)
        }
        return
      }
      const payload = await response.json().catch(() => ({})) as { turn?: BackgroundTurnResult }
      const result = payload?.turn
      if (!response.ok || !result) return
      if (result.status === "pending") {
        const id = window.setTimeout(poll, RECOVERY_POLL_MS)
        runtime.recoveryTimers.set(timerKey, id)
        return
      }
      if (result.status === "complete" || result.status === "failed") {
        const patched = patchRecoveredTurn(runtime, accountKey, pending, result)
        if (!patched) {
          const id = window.setTimeout(poll, RECOVERY_POLL_MS)
          runtime.recoveryTimers.set(timerKey, id)
          return
        }
        removePending(runtime, accountKey, turnId)
        scheduleRecoveryReload(runtime)
      }
    } catch {
      const id = window.setTimeout(poll, RECOVERY_POLL_MS)
      runtime.recoveryTimers.set(timerKey, id)
    }
  }

  const id = window.setTimeout(poll, 120)
  runtime.recoveryTimers.set(timerKey, id)
}

function resumeDetachedTurns(runtime: BackgroundRuntime, accountKey: string) {
  for (const turn of readPending(runtime, accountKey)) {
    if (turn.detached || turn.pageId !== runtime.pageId) pollDetachedTurn(runtime, accountKey, turn.turnId)
  }
}

function installBackgroundRuntime(
  accountKey: string,
  rawGetItem: typeof Storage.prototype.getItem,
  rawSetItem: typeof Storage.prototype.setItem,
  rawRemoveItem: typeof Storage.prototype.removeItem,
) {
  const globalWindow = window as Window & { __malikBackgroundChatRuntimeV1?: BackgroundRuntime }
  const existing = globalWindow.__malikBackgroundChatRuntimeV1
  if (existing) {
    existing.currentAccountKey = accountKey
    resumeDetachedTurns(existing, accountKey)
    return existing
  }

  const originalAbort = AbortController.prototype.abort
  const runtime: BackgroundRuntime = {
    pageId: crypto.randomUUID(),
    currentAccountKey: accountKey,
    baseFetch: window.fetch.bind(window),
    rawGetItem,
    rawSetItem,
    rawRemoveItem,
    originalAbort,
    patchedAbort: originalAbort,
    protectedChatSignals: new WeakSet<AbortSignal>(),
    latestController: null,
    latestTurnId: "",
    latestAccountKey: "",
    reloadScheduled: false,
    recoveryTimers: new Map<string, number>(),
  }

  runtime.patchedAbort = function patchedMalikAbort(this: AbortController, reason?: any) {
    if (runtime.protectedChatSignals.has(this.signal)) {
      // Automatic turn replacement, section switches and runtime cleanup are
      // not allowed to kill an answer. Explicit Stop uses runtime.originalAbort
      // on the network controller below and remains the only cancellation path.
      return
    }
    return runtime.originalAbort.call(this, reason)
  }
  AbortController.prototype.abort = runtime.patchedAbort

  const backgroundFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (requestPath(input) !== CHAT_STREAM_PATH) return runtime.baseFetch(input, init)

    const malikTurnSignal = incomingSignal(input, init)
    if (malikTurnSignal) runtime.protectedChatSignals.add(malikTurnSignal)

    const turnId = crypto.randomUUID()
    const accountAtStart = runtime.currentAccountKey || "guest"
    const controller = new AbortController()
    runtime.latestController = controller
    runtime.latestTurnId = turnId
    runtime.latestAccountKey = accountAtStart

    const pending: PendingBackgroundTurn = {
      turnId,
      prompt: parsePrompt(init),
      createdAt: Date.now(),
      pageId: runtime.pageId,
    }
    upsertPending(runtime, accountAtStart, pending)
    scheduleTurnLocationCapture(runtime, accountAtStart, turnId)

    const target = requestUrl(input)
    target.pathname = BACKGROUND_STREAM_PATH
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined)
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    headers.set("x-malik-background-turn-id", turnId)

    if (typeof Request !== "undefined" && input instanceof Request) {
      const rewritten = new Request(target.href, input)
      return runtime.baseFetch(rewritten, { ...(init || {}), headers, signal: controller.signal })
    }
    return runtime.baseFetch(target.href, { ...(init || {}), headers, signal: controller.signal })
  }) as typeof window.fetch

  window.fetch = backgroundFetch

  const onExplicitStop = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest(".malik-runtime-stop")) return
    const controller = runtime.latestController
    const turnId = runtime.latestTurnId
    const accountAtStart = runtime.latestAccountKey
    runtime.latestController = null
    runtime.latestTurnId = ""
    runtime.latestAccountKey = ""
    if (turnId && accountAtStart) removePending(runtime, accountAtStart, turnId)
    if (controller && !controller.signal.aborted) {
      try { runtime.originalAbort.call(controller, "Malik AI stopped by user") } catch {}
    }
  }
  window.addEventListener("click", onExplicitStop, true)

  globalWindow.__malikBackgroundChatRuntimeV1 = runtime
  resumeDetachedTurns(runtime, accountKey)
  return runtime
}

/**
 * Gives every WorkOS account its own chat snapshot without changing the huge
 * dashboard state machine. Dashboard still reads/writes its legacy key, but the
 * Storage methods transparently route that key to the active account key.
 *
 * Text turns also get a durable background id. Starting another chat never
 * aborts an existing answer; leaving the workspace marks unfinished turns for
 * recovery, and the next visit patches the finished answer into the exact chat.
 */
export function AccountChatPersistence({ accountId, children }: { accountId: string; children: ReactNode }) {
  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof Storage === "undefined") return

    const storage = window.localStorage
    const proto = Storage.prototype
    const previousGetItem = proto.getItem
    const previousSetItem = proto.setItem
    const previousRemoveItem = proto.removeItem
    const scopedAccountKey = cleanAccountId(accountId)
    const scopedKey = scopedDashboardKey(scopedAccountKey)
    const backgroundRuntime = installBackgroundRuntime(scopedAccountKey, previousGetItem, previousSetItem, previousRemoveItem)
    backgroundRuntime.currentAccountKey = scopedAccountKey

    // One-time migration for the account that owns the browser's pre-V7 state.
    // After that, the unscoped key is never allowed to leak into another login.
    try {
      const scoped = previousGetItem.call(storage, scopedKey)
      const legacy = previousGetItem.call(storage, DASHBOARD_STORAGE_KEY)
      const migrated = previousGetItem.call(storage, MIGRATION_MARKER)
      if (!scoped && legacy && !migrated) {
        previousSetItem.call(storage, scopedKey, legacy)
        previousSetItem.call(storage, MIGRATION_MARKER, scopedKey)
      }
      previousRemoveItem.call(storage, DASHBOARD_STORAGE_KEY)
    } catch (error) {
      console.warn("[ACCOUNT CHAT PERSISTENCE] migration skipped", error)
    }

    const routedGetItem = function (this: Storage, key: string): string | null {
      if (this === storage && key === DASHBOARD_STORAGE_KEY) {
        return previousGetItem.call(this, scopedKey)
      }
      return previousGetItem.call(this, key)
    }

    const routedSetItem = function (this: Storage, key: string, value: string): void {
      if (this === storage && key === DASHBOARD_STORAGE_KEY) {
        previousSetItem.call(this, scopedKey, value)
        return
      }
      previousSetItem.call(this, key, value)
    }

    const routedRemoveItem = function (this: Storage, key: string): void {
      if (this === storage && key === DASHBOARD_STORAGE_KEY) {
        previousRemoveItem.call(this, scopedKey)
        return
      }
      previousRemoveItem.call(this, key)
    }

    proto.getItem = routedGetItem
    proto.setItem = routedSetItem
    proto.removeItem = routedRemoveItem
    resumeDetachedTurns(backgroundRuntime, scopedAccountKey)

    return () => {
      markAccountDetached(backgroundRuntime, scopedAccountKey)
      if (proto.getItem === routedGetItem) proto.getItem = previousGetItem
      if (proto.setItem === routedSetItem) proto.setItem = previousSetItem
      if (proto.removeItem === routedRemoveItem) proto.removeItem = previousRemoveItem
    }
  }, [accountId])

  return children
}

export default AccountChatPersistence
