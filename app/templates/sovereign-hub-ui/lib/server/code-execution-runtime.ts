import "server-only"

export type MalikExecutionLanguage = "python" | "javascript" | "typescript" | "r"

export type MalikExecutionResult = {
  ok: boolean
  language: MalikExecutionLanguage
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs?: number
  artifacts?: Array<{ name: string; url?: string; mime?: string }>
}

const MAX_CODE_CHARS = 80_000
const MAX_OUTPUT_CHARS = 160_000

function runnerUrl() {
  const raw = String(process.env.MALIK_CODE_EXECUTION_URL || "").trim()
  if (!raw) return ""
  try {
    const url = new URL(raw)
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:") ? url.toString() : ""
  } catch {
    return ""
  }
}

export function malikCodeExecutionStatus() {
  return {
    configured: Boolean(runnerUrl()),
    isolated: true,
    localEval: false,
    languages: ["python", "javascript", "typescript", "r"] as MalikExecutionLanguage[],
  }
}

function normalizeLanguage(value: unknown): MalikExecutionLanguage {
  const language = String(value || "python").trim().toLowerCase()
  if (language === "js" || language === "node") return "javascript"
  if (language === "ts") return "typescript"
  if (language === "python" || language === "javascript" || language === "typescript" || language === "r") return language
  throw new Error("Unsupported execution language")
}

function safeArtifacts(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 24).flatMap((item): Array<{ name: string; url?: string; mime?: string }> => {
    if (!item || typeof item !== "object") return []
    const name = String((item as any).name || "").replace(/[^\p{L}\p{N}._ -]/gu, "").trim().slice(0, 160)
    if (!name) return []
    const rawUrl = String((item as any).url || "").trim()
    let url = ""
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol === "https:") url = parsed.toString()
    } catch {}
    return [{
      name,
      ...(url ? { url } : {}),
      mime: String((item as any).mime || "").slice(0, 120) || undefined,
    }]
  })
}

export async function executeMalikCode(input: {
  language?: string
  code: string
  stdin?: string
}) : Promise<MalikExecutionResult> {
  const url = runnerUrl()
  if (!url) throw new Error("Isolated code execution runtime is not configured")
  const language = normalizeLanguage(input.language)
  const code = String(input.code || "")
  if (!code.trim()) throw new Error("Code is required")
  if (code.length > MAX_CODE_CHARS) throw new Error("Code is too large for one execution job")
  const stdin = String(input.stdin || "").slice(0, 200_000)

  const controller = new AbortController()
  const timeoutMs = Math.max(5_000, Math.min(180_000, Number(process.env.MALIK_CODE_EXECUTION_TIMEOUT_MS || 90_000)))
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const token = String(process.env.MALIK_CODE_EXECUTION_TOKEN || "").trim()
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(token ? { authorization: token.startsWith("Bearer ") ? token : "Bearer " + token } : {}),
      },
      body: JSON.stringify({
        version: 1,
        language,
        code,
        stdin,
        limits: {
          wallTimeMs: timeoutMs,
          network: false,
          maxOutputChars: MAX_OUTPUT_CHARS,
        },
      }),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    })
    const payload = await response.json().catch(() => ({})) as any
    if (!response.ok) throw new Error(String(payload?.error || payload?.message || "Execution runner failed").slice(0, 800))

    const stdout = String(payload?.stdout || "").slice(0, MAX_OUTPUT_CHARS)
    const stderr = String(payload?.stderr || "").slice(0, MAX_OUTPUT_CHARS)
    const exitCode = Number.isFinite(Number(payload?.exitCode)) ? Number(payload.exitCode) : null

    return {
      ok: payload?.ok !== false && (exitCode === null || exitCode === 0),
      language,
      stdout,
      stderr,
      exitCode,
      durationMs: Number(payload?.durationMs) || Date.now() - startedAt,
      artifacts: safeArtifacts(payload?.artifacts),
    }
  } finally {
    clearTimeout(timer)
  }
}
