import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase"

export type SocialProviderId = "github" | "google" | "apple" | "discord"

export type SocialProviderConfig = {
  id: SocialProviderId
  name: string
  officialProviderId: SocialProviderId
  enabled: boolean
  configured: boolean
  envFlag?: string
}

function providerEnabled(envName?: string): boolean {
  if (!isSupabaseConfigured()) return false
  if (!envName) return false

  const value = process.env[envName]?.trim().toLowerCase()
  return value === "true" || value === "1" || value === "yes" || value === "on"
}

function getProviderConfig(provider: SocialProviderId): SocialProviderConfig | undefined {
  return getSocialProviders().find((item) => item.id === provider)
}

export function getSocialProviders(): SocialProviderConfig[] {
  const supabaseReady = isSupabaseConfigured()
  return [
    { id: "github", name: "GitHub", officialProviderId: "github", enabled: providerEnabled("NEXT_PUBLIC_ENABLE_GITHUB_OAUTH"), configured: supabaseReady, envFlag: "NEXT_PUBLIC_ENABLE_GITHUB_OAUTH" },
    { id: "google", name: "Google", officialProviderId: "google", enabled: providerEnabled("NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH"), configured: supabaseReady, envFlag: "NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH" },
    { id: "apple", name: "Apple", officialProviderId: "apple", enabled: providerEnabled("NEXT_PUBLIC_ENABLE_APPLE_OAUTH"), configured: supabaseReady, envFlag: "NEXT_PUBLIC_ENABLE_APPLE_OAUTH" },
    { id: "discord", name: "Discord", officialProviderId: "discord", enabled: providerEnabled("NEXT_PUBLIC_ENABLE_DISCORD_OAUTH"), configured: supabaseReady, envFlag: "NEXT_PUBLIC_ENABLE_DISCORD_OAUTH" },
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
    provider,
    options: {
      redirectTo: redirectTo || `${origin}/auth/callback`,
      skipBrowserRedirect: false,
    },
  })
  if (error) throw error
}
