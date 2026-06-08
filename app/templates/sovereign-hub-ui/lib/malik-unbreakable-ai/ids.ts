export function unbreakableId(prefix = "ub") {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`
  } catch {}
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

export function tinyHash(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

