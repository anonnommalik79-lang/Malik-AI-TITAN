export function safeParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function safeStringify(value: unknown, fallback = "{}") {
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

export function cloneJson<T>(value: T): T {
  return safeParse<T>(safeStringify(value), value)
}

