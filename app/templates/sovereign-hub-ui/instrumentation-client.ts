/* Malik AI entry contract.
   Preserve saved history, but every fresh page load opens the clean Home screen.
   Selecting an item in the real Sidebar still opens that saved chat normally. */
const MALIK_DASHBOARD_STORAGE_KEY = "malik_dashboard_state_v3"

/*
 * Voice Mode is intentionally a lazy route-sized component because it owns the
 * orb, speech stack and audio runtime. The downside was that the first click
 * could look dead while its chunk was still downloading; people then clicked
 * the item repeatedly until the import happened to finish.
 *
 * Warm the exact same module as soon as the client runtime starts. Webpack/Next
 * shares the module cache with dashboard.tsx, so the real `voiceModeOpen` state
 * still owns opening/closing — this only removes the first-click network wait.
 */
let voiceModePreload: Promise<unknown> | null = null

function preloadVoiceMode() {
  if (!voiceModePreload) {
    voiceModePreload = import("./components/voice/VoiceMode").catch(() => {
      // A transient chunk/network failure must be retryable on the next load.
      voiceModePreload = null
    })
  }
  return voiceModePreload
}

declare global {
  interface Window {
    __malikHomeEntryPrepared?: boolean
    __malikVoiceShortcutPrepared?: boolean
  }
}

if (typeof window !== "undefined") {
  // Start immediately rather than waiting for requestIdleCallback: Voice is a
  // primary navigation item and must be ready on the very first deliberate click.
  void preloadVoiceMode()

  // Fast desktop entry even while the first Voice button is off-screen.
  if (!window.__malikVoiceShortcutPrepared) {
    window.__malikVoiceShortcutPrepared = true
    window.addEventListener("keydown", (event) => {
      if (!event.altKey || !event.shiftKey || event.code !== "KeyV" || event.repeat) return
      if (document.querySelector("[data-voice-mode]")) return
      const trigger = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Открыть голосовой режим"]:not([disabled])',
      )
      if (!trigger) return
      event.preventDefault()
      trigger.click()
    })
  }

  // Generated image bytes live in durable object storage, while localStorage is
  // only a tiny UI cache of short URLs/metadata. Refreshing, logging out and
  // logging back in therefore rehydrates the user's library instead of losing it.
  void import("./lib/media/image-history")
    .then(({ syncMalikImageHistoryFromAccount }) => syncMalikImageHistoryFromAccount())
    .catch(() => {})

  if (!window.__malikHomeEntryPrepared) {
    window.__malikHomeEntryPrepared = true
    try {
      const raw = window.localStorage.getItem(MALIK_DASHBOARD_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") {
          window.localStorage.setItem(
            MALIK_DASHBOARD_STORAGE_KEY,
            JSON.stringify({
              ...parsed,
              activeChatId: null,
              messages: [],
              generatedCode: "",
              activeView: "home",
            }),
          )
        }
      }
    } catch {
      // Storage can be unavailable in private/locked browser contexts.
    }
  }
}

export {}
