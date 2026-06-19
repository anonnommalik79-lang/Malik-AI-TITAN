import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase"

export type SocialProviderId = "github" | "google" | "apple" | "microsoft"
type SupabaseOAuthProviderId = "github" | "google" | "apple" | "azure"

export type SocialProviderConfig = {
  id: SocialProviderId
  name: string
  officialProviderId: SupabaseOAuthProviderId
  enabled: boolean
  configured: boolean
  envFlag?: string
}

function providerEnabled(envName?: string): boolean {
  if (!isSupabaseConfigured()) return false
  if (!envName) return false

  const value = process.env[envName]?.trim().toLowerCase()
  if (!value) return true
  return value === "true" || value === "1" || value === "yes" || value === "on"
}

function microsoftEnabled(): boolean {
  if (!isSupabaseConfigured()) return false
  const values = [
    process.env.NEXT_PUBLIC_ENABLE_MICROSOFT_OAUTH,
    process.env.NEXT_PUBLIC_ENABLE_AZURE_OAUTH,
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean)

  if (!values.length) return true
  return values.every((value) => value !== "false" && value !== "0" && value !== "no" && value !== "off")
}

function getProviderConfig(provider: SocialProviderId): SocialProviderConfig | undefined {
  return getSocialProviders().find((item) => item.id === provider)
}

export function getSocialProviders(): SocialProviderConfig[] {
  const supabaseReady = isSupabaseConfigured()
  return [
    { id: "google", name: "Google", officialProviderId: "google", enabled: providerEnabled("NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH"), configured: supabaseReady, envFlag: "NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH" },
    { id: "github", name: "GitHub", officialProviderId: "github", enabled: providerEnabled("NEXT_PUBLIC_ENABLE_GITHUB_OAUTH"), configured: supabaseReady, envFlag: "NEXT_PUBLIC_ENABLE_GITHUB_OAUTH" },
    { id: "apple", name: "Apple", officialProviderId: "apple", enabled: providerEnabled("NEXT_PUBLIC_ENABLE_APPLE_OAUTH"), configured: supabaseReady, envFlag: "NEXT_PUBLIC_ENABLE_APPLE_OAUTH" },
    { id: "microsoft", name: "Microsoft", officialProviderId: "azure", enabled: microsoftEnabled(), configured: supabaseReady, envFlag: "NEXT_PUBLIC_ENABLE_MICROSOFT_OAUTH" },
  ]
}

export async function loginWithSocialProvider(provider: SocialProviderId, redirectTo?: string) {
  const providerConfig = getProviderConfig(provider)

  if (!providerConfig?.enabled || !providerConfig?.configured) {
    throw new Error(
      `${providerConfig?.name || provider} login is disabled. Enable ${providerConfig?.envFlag || "this provider"}=true only after the provider is configured in Supabase.`,
    )
  }

  const client = getSupabaseClient()
  if (!client) {
    throw new Error("Configure Supabase URL and anon key to enable this sign-in method.")
  }

  const origin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || ""
  const { error } = await client.auth.signInWithOAuth({
    provider: providerConfig.officialProviderId,
    options: {
      redirectTo: redirectTo || `${origin}/auth/callback`,
      skipBrowserRedirect: false,
      queryParams:
        provider === "google"
          ? {
              access_type: "offline",
              prompt: "consent",
            }
          : undefined,
    },
  })
  if (error) throw error
}
