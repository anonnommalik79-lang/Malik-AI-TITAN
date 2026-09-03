/* Malik AI entry contract.
   Preserve saved history, but every fresh page load opens the clean Home screen.
   Selecting an item in the real Sidebar still opens that saved chat normally. */
const MALIK_DASHBOARD_STORAGE_KEY = "malik_dashboard_state_v3"

declare global {
  interface Window {
    __malikHomeEntryPrepared?: boolean
  }
}

if (typeof window !== "undefined" && !window.__malikHomeEntryPrepared) {
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

export {}
