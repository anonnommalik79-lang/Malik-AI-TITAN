import { hasLocalStorage } from "./safe-storage"
import { UNBREAKABLE_LIMITS } from "./constants"

export function storageGuardReport() {
  if (!hasLocalStorage()) return { ok: false, bytes: 0, message: "localStorage unavailable" }
  try {
    let bytes = 0
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i) || ""
      bytes += key.length + (window.localStorage.getItem(key) || "").length
    }
    return { ok: bytes < UNBREAKABLE_LIMITS.maxLocalStorageBytes, bytes, message: "localStorage checked" }
  } catch {
    return { ok: false, bytes: 0, message: "localStorage check failed" }
  }
}

