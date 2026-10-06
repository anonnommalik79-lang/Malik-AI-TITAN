export type AuthFeature = "chat" | "images" | "video" | "music" | "work"

export function readAuthFeature(value: unknown): AuthFeature | null {
  return typeof value === "string" && ["chat", "images", "video", "music", "work"].includes(value)
    ? value as AuthFeature : null
}

export function guestEntryPath(value: unknown): string {
  const feature = readAuthFeature(value)
  return feature ? `/dashboard?feature=${feature}` : "/dashboard"
}

export function dashboardEntry(value: unknown): {
  initialView: "home" | "photo-generation" | "video-generation" | "music-generation"
  initialWorkspaceMode?: "chat" | "work"
} {
  switch (readAuthFeature(value)) {
    case "images": return { initialView: "photo-generation", initialWorkspaceMode: "chat" }
    case "video": return { initialView: "video-generation", initialWorkspaceMode: "chat" }
    case "music": return { initialView: "music-generation", initialWorkspaceMode: "chat" }
    case "work": return { initialView: "home", initialWorkspaceMode: "work" }
    case "chat": return { initialView: "home", initialWorkspaceMode: "chat" }
    default: return { initialView: "home" }
  }
}

/** Select a social provider AFTER AuthKit has stored its sealed PKCE state.
 * Keep the callback, state and code challenge from the SDK unchanged. */
export function selectSignInProvider(authorizationUrl: string, requested: unknown): string {
  const provider = requested === "google" ? "GoogleOAuth"
    : requested === "apple" ? "AppleOAuth"
    : requested === "microsoft" ? "MicrosoftOAuth" : null
  if (!provider) return authorizationUrl
  const url = new URL(authorizationUrl)
  url.searchParams.set("provider", provider)
  // WorkOS accepts screen_hint only for the hosted AuthKit provider.
  url.searchParams.delete("screen_hint")
  return url.toString()
}
