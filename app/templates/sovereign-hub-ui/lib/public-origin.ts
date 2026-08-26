const PRODUCTION_ORIGIN = "https://malikaiworld.world"
const PRODUCTION_CALLBACK = `${PRODUCTION_ORIGIN}/callback`

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return ""
  }
}

export function getPublicOrigin() {
  // Production is intentionally locked to the canonical public domain.
  // Never trust Render's internal request host or a stale localhost env value.
  if (process.env.NODE_ENV === "production") return PRODUCTION_ORIGIN

  const configured = normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "",
  )

  return configured || "http://localhost:3000"
}

export function getPublicUrl(path = "/") {
  return new URL(path, `${getPublicOrigin()}/`).toString()
}

export function getWorkOSRedirectUri() {
  // WorkOS must always return production users to the real Malik AI domain.
  if (process.env.NODE_ENV === "production") return PRODUCTION_CALLBACK

  const configured =
    process.env.WORKOS_REDIRECT_URI || process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI || ""

  if (configured) {
    try {
      return new URL(configured).toString()
    } catch {
      // Fall through to local callback.
    }
  }

  return getPublicUrl("/callback")
}
