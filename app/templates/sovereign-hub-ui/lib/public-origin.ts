const PRODUCTION_ORIGIN = "https://malikaiworld.world"

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return ""
  }
}

function isInternalOrigin(value: string) {
  try {
    const { hostname } = new URL(value)
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".internal")
    )
  } catch {
    return true
  }
}

export function getPublicOrigin() {
  const configured = normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "",
  )

  if (configured && (process.env.NODE_ENV !== "production" || !isInternalOrigin(configured))) {
    return configured
  }

  return process.env.NODE_ENV === "production"
    ? PRODUCTION_ORIGIN
    : configured || "http://localhost:3000"
}

export function getPublicUrl(path = "/") {
  return new URL(path, `${getPublicOrigin()}/`).toString()
}

export function getWorkOSRedirectUri() {
  const configured =
    process.env.WORKOS_REDIRECT_URI || process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI || ""

  if (configured) {
    try {
      const url = new URL(configured)
      if (process.env.NODE_ENV !== "production" || !isInternalOrigin(url.origin)) {
        return url.toString()
      }
    } catch {
      // Fall through to the public callback URL.
    }
  }

  return getPublicUrl("/callback")
}
