import { createClient } from "@supabase/supabase-js"

function config() {
  return {
    url: (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim(),
    anonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim(),
  }
}

export function isServerSupabaseConfigured() {
  const { url, anonKey } = config()
  return Boolean(url && anonKey)
}

export function createSupabaseUserClient(accessToken: string) {
  const { url, anonKey } = config()
  if (!url || !anonKey || !accessToken) return null
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}
