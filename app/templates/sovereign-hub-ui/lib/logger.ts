type LogLevel = "debug" | "info" | "warn" | "error"

type LogEvent = {
  level: LogLevel
  event: string
  message: string
  metadata?: Record<string, unknown>
  timestamp: string
  durationMs?: number
}

const SECRET_KEYS = [/key/i, /secret/i, /token/i, /password/i, /authorization/i, /cookie/i]
const events: LogEvent[] = []

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== "object") return value
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.some((pattern) => pattern.test(key))) out[key] = "[redacted]"
    else if (typeof val === "object" && val !== null) out[key] = sanitize(val)
    else out[key] = val
  }
  return out
}

export function logEvent(input: Omit<LogEvent, "timestamp">) {
  const event: LogEvent = {
    ...input,
    metadata: sanitize(input.metadata) as Record<string, unknown> | undefined,
    timestamp: new Date().toISOString(),
  }
  events.push(event)
  if (events.length > 500) events.shift()

  const line = `[MALIK:${event.level.toUpperCase()}] ${event.event} — ${event.message}`
  if (event.level === "error") console.error(line, event.metadata || "")
  else if (event.level === "warn") console.warn(line, event.metadata || "")
  else console.log(line, event.metadata || "")

  return event
}

export function getRecentLogs(limit = 100) {
  return events.slice(-limit).reverse()
}

export function createTimer(event: string, metadata?: Record<string, unknown>) {
  const started = Date.now()
  return {
    end(message = "completed", level: LogLevel = "info") {
      return logEvent({ level, event, message, metadata, durationMs: Date.now() - started })
    },
  }
}

