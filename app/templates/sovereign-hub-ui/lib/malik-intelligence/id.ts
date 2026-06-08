export function createIntelligenceId(prefix = "intel") {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`
    }
  } catch {}
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

export function checksum(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return (hash >>> 0).toString(36)
}

