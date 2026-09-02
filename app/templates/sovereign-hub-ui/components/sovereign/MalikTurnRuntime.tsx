"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { isExplicitImageGenerationRequest } from "@/lib/ai/image-intent"

const IMAGE_MODE_STORAGE_KEY = "malik_image_mode_v1"
const CHAT_SENTINEL = "/__malik_chat__ "
const SEND_BUTTON_SELECTOR = ".malik-inline-send, .thome-submit"
const COMPOSER_FIELD_SELECTOR = ".malik-composer-textarea, .thome-composer textarea"
const TURN_FETCH_PATHS = new Set([
  "/api/stream",
  "/api/generate/photo",
  "/api/generate/video",
  "/api/ai/video/status",
  "/api/generate/video/status",
  "/api/media/video/status",
])
const PRIMARY_TURN_PATHS = new Set([
  "/api/stream",
])

/**
 * Generating a picture or a video is not part of a chat turn, and tying it to
 * one was the bug behind "Фото не создано - Fetch is aborted".
 *
 * A photo takes about seventeen seconds on the server, measured. A chat turn is
 * over in a second or two, and when it ends this runtime abandons its
 * controller and aborts it - which killed the picture that was still being
 * made. Worse, "is a turn running" is worked out by watching whether a send
 * button is disabled in the DOM, so the moment the composer re-enabled, the
 * next request through here aborted whatever shared controller was in flight.
 *
 * So media generation gets its own controller with its own lifetime. Nothing
 * cancels it except the person: not a new message, not switching to another
 * section, not backgrounding the app to read a notification.
 */
const MEDIA_TURN_PATHS = new Set([
  "/api/generate/photo",
  "/api/generate/video",
  "/api/ai/video/status",
  "/api/generate/video/status",
  "/api/media/video/status",
])

/** The two that start new work. The rest only ask how the work is going. */
const MEDIA_START_PATHS = new Set([
  "/api/generate/photo",
  "/api/generate/video",
])

function nativeTextareaSetter(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
  if (setter) setter.call(field, value)
  else field.value = value
}

function composerFieldForButton(button: Element | null): HTMLTextAreaElement | null {
  if (!button) return null
  if (button.classList.contains("malik-inline-send")) {
    return document.querySelector<HTMLTextAreaElement>(".malik-composer-textarea")
  }
  if (button.classList.contains("thome-submit")) {
    return document.querySelector<HTMLTextAreaElement>(".thome-composer textarea")
  }
  return document.querySelector<HTMLTextAreaElement>(COMPOSER_FIELD_SELECTOR)
}

function imageModePinned() {
  try {
    return window.localStorage.getItem(IMAGE_MODE_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function isSlashCommand(value: string) {
  return /^\s*\/[\p{L}\p{N}_-]+/u.test(value)
}

function shouldStayText(value: string) {
  const clean = value.trim()
  if (!clean || !imageModePinned() || isSlashCommand(clean)) return false
  return !isExplicitImageGenerationRequest(clean)
}

function pathFromFetchInput(input: RequestInfo | URL) {
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

function mergeSignals(first?: AbortSignal | null, second?: AbortSignal | null): AbortSignal | undefined {
  if (!first) return second || undefined
  if (!second) return first
  if (first === second) return first

  const abortSignalWithAny = AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal
  }
  if (typeof abortSignalWithAny.any === "function") {
    return abortSignalWithAny.any([first, second])
  }

  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) controller.abort()
  }
  if (first.aborted || second.aborted) abort()
  else {
    first.addEventListener("abort", abort, { once: true })
    second.addEventListener("abort", abort, { once: true })
  }
  return controller.signal
}

function stoppedError() {
  const error = new Error("Генерация остановлена пользователем.")
  error.name = "AbortError"
  return error
}

function stoppedSseResponse() {
  const body = [
    "event: content",
    `data: ${JSON.stringify({ type: "content", content: "\n\nОстановлено пользователем." })}`,
    "",
    "event: done",
    `data: ${JSON.stringify({ type: "done", usedWeb: false })}`,
    "",
  ].join("\n")

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  })
}

function wrapStreamingResponse(response: Response, turnSignal: AbortSignal, stopped: () => boolean) {
  if (!response.body) return response

  const reader = response.body.getReader()
  const encoder = new TextEncoder()
  let injectedStop = false

  const injectAndClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (injectedStop) return
    injectedStop = true
    try {
      controller.enqueue(encoder.encode(
        `\n\nevent: content\ndata: ${JSON.stringify({ type: "content", content: "\n\nОстановлено пользователем." })}\n\n`,
      ))
    } catch {
      // The consumer may already be gone. In that case the network is still aborted.
    }
    try { controller.close() } catch {}
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (turnSignal.aborted || stopped()) {
        try { await reader.cancel("Malik AI turn stopped") } catch {}
        injectAndClose(controller)
        return
      }

      try {
        const { value, done } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        if (value) controller.enqueue(value)
      } catch (error) {
        if (turnSignal.aborted || stopped()) {
          injectAndClose(controller)
          return
        }
        controller.error(error)
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason) } catch {}
    },
  })

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function existingSignal(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.signal) return init.signal
  return typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined
}

export function MalikTurnRuntime() {
  const [controlTarget, setControlTarget] = useState<HTMLElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const activeControllerRef = useRef<AbortController | null>(null)
  const mediaControllerRef = useRef<AbortController | null>(null)
  const mediaStopRequestedRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const protectedFieldsRef = useRef(new WeakMap<HTMLTextAreaElement, string>())
  const busyRef = useRef(false)

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const protectedFields = protectedFieldsRef.current

    const beginTurn = () => {
      const previous = activeControllerRef.current
      if (previous && !previous.signal.aborted) {
        try { previous.abort() } catch {}
      }
      activeControllerRef.current = new AbortController()
      stopRequestedRef.current = false
      setStopping(false)
    }

    const protectTextTurn = (field: HTMLTextAreaElement | null) => {
      if (!field || protectedFields.has(field)) return
      const raw = field.value
      if (!shouldStayText(raw)) return
      protectedFields.set(field, raw)
      nativeTextareaSetter(field, `${CHAT_SENTINEL}${raw}`)
    }

    const restoreTextTurn = (field: HTMLTextAreaElement | null) => {
      if (!field) return
      const raw = protectedFields.get(field)
      if (raw === undefined) return
      nativeTextareaSetter(field, raw)
      protectedFields.delete(field)
    }

    const fieldFromKeyboardEvent = (event: KeyboardEvent) => {
      return event.target instanceof HTMLTextAreaElement && event.target.matches(COMPOSER_FIELD_SELECTOR)
        ? event.target
        : null
    }

    const fieldFromMouseEvent = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest(SEND_BUTTON_SELECTOR) || null
      return composerFieldForButton(button)
    }

    // Window capture runs BEFORE the old photo-mode bridge on document.
    // For a normal chat prompt we temporarily add a private slash sentinel,
    // making the old bridge leave it alone. documentElement capture restores
    // the DOM value before React's actual textarea/button handlers receive it.
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      const field = fieldFromKeyboardEvent(event)
      if (!field || !field.value.trim()) return
      protectTextTurn(field)
      beginTurn()
    }
    const onHtmlKeyDown = (event: KeyboardEvent) => {
      restoreTextTurn(fieldFromKeyboardEvent(event))
    }
    const onWindowClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest(SEND_BUTTON_SELECTOR) as HTMLButtonElement | null
      if (!button || button.disabled) return
      const field = composerFieldForButton(button)
      if (!field || !field.value.trim()) return
      protectTextTurn(field)
      beginTurn()
    }
    const onHtmlClick = (event: MouseEvent) => {
      restoreTextTurn(fieldFromMouseEvent(event))
    }

    window.addEventListener("keydown", onWindowKeyDown, true)
    document.documentElement.addEventListener("keydown", onHtmlKeyDown, true)
    window.addEventListener("click", onWindowClick, true)
    document.documentElement.addEventListener("click", onHtmlClick, true)

    const nativeFetch = window.fetch.bind(window)

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathFromFetchInput(input)
      if (!TURN_FETCH_PATHS.has(path)) return nativeFetch(input, init)

      // Media generation runs on its own controller and is never touched by the
      // chat turn's lifecycle. See MEDIA_TURN_PATHS above.
      if (MEDIA_TURN_PATHS.has(path)) {
        if (MEDIA_START_PATHS.has(path)) {
          mediaStopRequestedRef.current = false
          mediaControllerRef.current = new AbortController()
        } else if (mediaStopRequestedRef.current) {
          // A status poll for work the person already cancelled. Do not let a
          // timer that was already in flight bring it back.
          throw stoppedError()
        }

        let media = mediaControllerRef.current
        if (!media || media.signal.aborted) {
          media = new AbortController()
          mediaControllerRef.current = media
        }

        const mediaSignal = media.signal
        try {
          return await nativeFetch(input, { ...(init || {}), signal: mergeSignals(existingSignal(input, init), mediaSignal) })
        } catch (error) {
          if (mediaSignal.aborted || mediaStopRequestedRef.current) throw stoppedError()
          throw error
        }
      }

      let controller = activeControllerRef.current
      if (!controller || controller.signal.aborted) {
        // If this is a delayed network step from a turn the user already
        // stopped, never resurrect it just because a polling timer fired.
        if (stopRequestedRef.current && busyRef.current) {
          if (path === "/api/stream") return stoppedSseResponse()
          throw stoppedError()
        }
        controller = new AbortController()
        activeControllerRef.current = controller
        stopRequestedRef.current = false
        setStopping(false)
      } else if (PRIMARY_TURN_PATHS.has(path) && !busyRef.current && !stopRequestedRef.current) {
        // Programmatic starts (templates, quick actions, voice) may not pass
        // through the composer capture listeners. Give them their own turn.
        try { controller.abort() } catch {}
        controller = new AbortController()
        activeControllerRef.current = controller
      }

      const turnSignal = controller.signal
      const signal = mergeSignals(existingSignal(input, init), turnSignal)

      try {
        const response = await nativeFetch(input, { ...(init || {}), signal })
        if (path === "/api/stream") {
          return wrapStreamingResponse(response, turnSignal, () => stopRequestedRef.current)
        }
        return response
      } catch (error) {
        if (turnSignal.aborted || stopRequestedRef.current) {
          if (path === "/api/stream") return stoppedSseResponse()
          throw stoppedError()
        }
        throw error
      }
    }) as typeof window.fetch

    return () => {
      window.fetch = nativeFetch
      window.removeEventListener("keydown", onWindowKeyDown, true)
      document.documentElement.removeEventListener("keydown", onHtmlKeyDown, true)
      window.removeEventListener("click", onWindowClick, true)
      document.documentElement.removeEventListener("click", onHtmlClick, true)
      try { activeControllerRef.current?.abort() } catch {}
      activeControllerRef.current = null
      // mediaControllerRef is deliberately left alone. A picture that is being
      // made must survive this component remounting; only the person stops it.
    }
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return

    let frame = 0
    let previousBusy = false

    const scan = () => {
      frame = 0
      const target = document.querySelector<HTMLElement>(".malik-inline-action-swap")
        || document.querySelector<HTMLElement>(".thome-action-swap")
      const chatVoice = target?.querySelector<HTMLButtonElement>(".malik-voice-entry")
      const chatSend = target?.querySelector<HTMLButtonElement>(".malik-inline-send")
      const homeSubmit = target?.querySelector<HTMLButtonElement>(".thome-submit")
      const nextBusy = Boolean(
        chatVoice?.disabled
        || (chatSend?.disabled && document.querySelector("[data-malik-message='assistant'] .is-working"))
        || (homeSubmit?.disabled && document.querySelector("[data-malik-message='assistant'] .is-working")),
      )

      setControlTarget((current) => current === target ? current : target)
      setBusy((current) => current === nextBusy ? current : nextBusy)
      busyRef.current = nextBusy

      if (target) {
        if (nextBusy) target.setAttribute("data-malik-turn-busy", "1")
        else target.removeAttribute("data-malik-turn-busy")
      }

      if (previousBusy && !nextBusy) {
        activeControllerRef.current = null
        stopRequestedRef.current = false
        setStopping(false)
      }
      previousBusy = nextBusy
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(scan)
    }

    scan()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "class", "aria-disabled"],
    })

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      controlTarget?.removeAttribute("data-malik-turn-busy")
    }
  }, [])

  const stopTurn = () => {
    if (!busy || stopping) return
    stopRequestedRef.current = true
    setStopping(true)
    const controller = activeControllerRef.current
    if (controller && !controller.signal.aborted) {
      try { controller.abort() } catch {}
    }
    // This button is the only thing that may cancel a picture or a video.
    mediaStopRequestedRef.current = true
    const media = mediaControllerRef.current
    if (media && !media.signal.aborted) {
      try { media.abort() } catch {}
    }
  }

  return (
    <>
      <style>{`
        [data-malik-turn-busy="1"] > .malik-voice-entry,
        [data-malik-turn-busy="1"] > .malik-inline-send,
        [data-malik-turn-busy="1"] > .thome-submit {
          display: none !important;
        }

        .malik-runtime-stop {
          position: relative !important;
          display: inline-grid !important;
          place-items: center !important;
          width: 42px !important;
          height: 42px !important;
          min-width: 42px !important;
          min-height: 42px !important;
          flex: 0 0 42px !important;
          padding: 0 !important;
          border: 1px solid rgba(255,255,255,.16) !important;
          border-radius: 999px !important;
          background: #f1f1f2 !important;
          color: #09090a !important;
          cursor: pointer !important;
          box-shadow: none !important;
          outline: none !important;
          isolation: isolate;
        }

        .malik-runtime-stop::before {
          content: "";
          position: absolute;
          inset: -4px;
          z-index: -1;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: inherit;
          border-top-color: rgba(255,255,255,.62);
          animation: malik-runtime-stop-spin 1.15s linear infinite;
        }

        .malik-runtime-stop__square {
          width: 11px;
          height: 11px;
          border-radius: 2.5px;
          background: currentColor;
        }

        .malik-runtime-stop.is-stopping::before {
          animation-duration: .55s;
        }

        .malik-runtime-stop:focus-visible {
          outline: 2px solid rgba(255,255,255,.65) !important;
          outline-offset: 3px !important;
        }

        @keyframes malik-runtime-stop-spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          #malik-root .malik-dashboard-shell .malik-runtime-stop,
          #malik-root .malik-dashboard-shell .malik-inline-action-swap > .malik-runtime-stop,
          #malik-root .malik-dashboard-shell .thome-action-swap > .malik-runtime-stop {
            width: 40px !important;
            height: 40px !important;
            min-width: 40px !important;
            min-height: 40px !important;
            max-width: 40px !important;
            flex-basis: 40px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .malik-runtime-stop::before { animation: none; }
        }
      `}</style>

      {busy && controlTarget && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              className={`malik-runtime-stop${stopping ? " is-stopping" : ""}`}
              aria-label={stopping ? "Останавливаю Malik AI" : "Остановить ответ Malik AI"}
              title={stopping ? "Останавливаю…" : "Остановить"}
              onClick={stopTurn}
              disabled={stopping}
            >
              <span className="malik-runtime-stop__square" aria-hidden="true" />
            </button>,
            controlTarget,
          )
        : null}
    </>
  )
}

export default MalikTurnRuntime
