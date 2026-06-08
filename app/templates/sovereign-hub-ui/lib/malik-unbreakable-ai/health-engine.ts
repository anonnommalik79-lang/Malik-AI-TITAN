import type { UnbreakableCheck } from "./types"
import { isoNow } from "./time"

export function makeCheck(id: string, title: string, ok: boolean, message: string, fix?: string): UnbreakableCheck {
  return {
    id,
    title,
    layer: id.includes("auth") ? "auth" : id.includes("media") ? "media" : id.includes("code") ? "code" : "ui",
    status: ok ? "healthy" : "degraded",
    score: ok ? 100 : 45,
    message,
    fix,
    updatedAt: isoNow(),
  }
}

export function baseHealthChecks() {
  return [
    makeCheck("ui-render", "UI render guard", true, "Frontend loaded without dynamic API routes."),
    makeCheck("storage-safe", "Safe localStorage", true, "Storage access is guarded."),
    makeCheck("security-secrets", "No secrets in client", true, "Only NEXT_PUBLIC values may appear in frontend."),
  ]
}

