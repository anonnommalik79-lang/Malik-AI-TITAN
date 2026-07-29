export const dynamic = "force-dynamic"
export const revalidate = 0

function cleanUrl(value?: string | null) {
  return String(value || "").trim().replace(/\/$/, "")
}

function cleanKey(value?: string | null) {
  return String(value || "").trim()
}

export async function GET() {
  const url = cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  const anonKey = cleanKey(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY,
  )

  const payload = JSON.stringify({ url, anonKey }).replace(/</g, "\\u003c")
  const script = `window.__MALIK_SUPABASE__=${payload};`

  return new Response(script, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
      "x-content-type-options": "nosniff",
    },
  })
}
