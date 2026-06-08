import { createClient } from "@supabase/supabase-js"

function config() {
  return {
    url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
    serviceRole: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  }
}

export function isSupabaseAdminConfigured() {
  const { url, serviceRole } = config()
  return Boolean(url && serviceRole)
}

export function createSupabaseAdminClient() {
  const { url, serviceRole } = config()
  if (!url || !serviceRole) return null
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
