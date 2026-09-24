import "server-only"

export type MalikComputerReceipt = {
  ok: boolean
  sessionId?: string
  status: string
  summary: string
  steps: Array<{ action: string; status: string; detail?: string }>
  screenshots: Array<{ url: string; label?: string }>
}

const MAX_TASK_CHARS = 8_000

function runnerUrl() {
  const raw = String(process.env.MALIK_COMPUTER_USE_URL || "").trim()
  if (!raw) return ""
  try {
    const url = new URL(raw)
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:") ? url.toString() : ""
  } catch {
    return ""
  }
}

export function malikComputerUseStatus() {
  return {
    configured: Boolean(runnerUrl()),
    remoteOnly: true,
    requiresConfirmation: true,
  }
}

function clean(value: unknown, max = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max)
}

function safeScreenshots(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).flatMap((item): Array<{ url: string; label?: string }> => {
    if (!item || typeof item !== "object") return []
    const raw = String((item as any).url || "").trim()
    try {
      const parsed = new URL(raw)
      if (parsed.protocol !== "https:") return []
      return [{ url: parsed.toString(), label: clean((item as any).label, 120) || undefined }]
    } catch {
      return []
    }
  })
}

export async function runMalikComputerTask(input: {
  task: string
  sessionId?: string
  mode?: "browser" | "desktop"
}) : Promise<MalikComputerReceipt> {
  const url = runnerUrl()
  if (!url) throw new Error("Computer-use runtime is not configured")
  const task = String(input.task || "").trim()
  if (!task) throw new Error("Computer-use task is required")
  if (task.length > MAX_TASK_CHARS) throw new Error("Computer-use task is too large")

  const controller = new AbortController()
  const timeoutMs = Math.max(10_000, Math.min(300_000, Number(process.env.MALIK_COMPUTER_USE_TIMEOUT_MS || 180_000)))
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const token = String(process.env.MALIK_COMPUTER_USE_TOKEN || "").trim()
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(token ? { authorization: token.startsWith("Bearer ") ? token : "Bearer " + token } : {}),
      },
      body: JSON.stringify({
        version: 1,
        task,
        sessionId: String(input.sessionId || "").slice(0, 200) || undefined,
        mode: input.mode === "desktop" ? "desktop" : "browser",
        policy: {
          requireHumanConfirmationFor: ["purchase", "send", "publish", "delete", "install", "permission-change"],
          captureReceipts: true,
        },
      }),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    })
    const payload = await response.json().catch(() => ({})) as any
    if (!response.ok) throw new Error(clean(payload?.error || payload?.message || "Computer-use runner failed", 800))

    const steps = Array.isArray(payload?.steps)
      ? payload.steps.slice(0, 80).map((item: any) => ({
          action: clean(item?.action || item?.name || "step", 160),
          status: clean(item?.status || "done", 80),
          detail: clean(item?.detail || item?.message || "", 500) || undefined,
        }))
      : []

    return {
      ok: payload?.ok !== false,
      sessionId: clean(payload?.sessionId, 200) || undefined,
      status: clean(payload?.status || (payload?.ok === false ? "failed" : "complete"), 80),
      summary: clean(payload?.summary || payload?.message || "", 4_000),
      steps,
      screenshots: safeScreenshots(payload?.screenshots),
    }
  } finally {
    clearTimeout(timer)
  }
}
