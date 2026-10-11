/**
 * The chat's 👍/👎: restored on load, saved on click. The server keeps the
 * account's marks (any device); this browser keeps a small copy so a guest's
 * marks survive a reload too. Failures never block the button.
 */

export type AnswerMark = "up" | "down"

const LOCAL_KEY = "malik_answer_feedback_v1"
const LOCAL_MAX = 300
let loading: Promise<Record<string, AnswerMark>> | null = null

function readLocal(): Record<string, AnswerMark> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "{}")
    if (!parsed || typeof parsed !== "object") return {}
    const marks: Record<string, AnswerMark> = {}
    for (const [id, value] of Object.entries(parsed)) if (value === "up" || value === "down") marks[id] = value
    return marks
  } catch {
    return {}
  }
}

function writeLocal(messageId: string, value: AnswerMark | null) {
  try {
    const marks = readLocal()
    delete marks[messageId]
    if (value) marks[messageId] = value
    const entries = Object.entries(marks).slice(-LOCAL_MAX)
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {}
}

/** The marks to show: this browser's copy, overridden by the account's saved marks. */
export function loadAnswerFeedback(fetcher: typeof fetch = fetch) {
  loading ||= fetcher("/api/chat/feedback", { cache: "no-store", headers: { accept: "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => ({ ...readLocal(), ...(payload?.feedback && typeof payload.feedback === "object" ? payload.feedback : {}) }))
    .catch(() => readLocal())
  return loading
}

/** Next mark after a click: the same button again clears it. */
export function nextAnswerMark(current: AnswerMark | null | undefined, clicked: AnswerMark): AnswerMark | null {
  return current === clicked ? null : clicked
}

export async function saveAnswerFeedback(messageId: string, value: AnswerMark | null, modelId?: string, fetcher: typeof fetch = fetch) {
  writeLocal(messageId, value)
  try {
    const response = await fetcher("/api/chat/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId, value, ...(modelId ? { modelId } : {}) }),
      keepalive: true,
    })
    return response.ok
  } catch {
    return false
  }
}
