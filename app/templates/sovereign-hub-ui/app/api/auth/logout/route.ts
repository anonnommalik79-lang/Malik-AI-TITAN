import { createSupabaseUserClient, isServerSupabaseConfigured } from "@/lib/server/supabase-user"
import { cookies } from "next/headers"

export const runtime = "nodejs"

function bearer(request: Request) {
  const value = request.headers.get("authorization") || ""
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : ""
}

async function clearSupabaseCookies(response: Response) {
  const cookieStore = await cookies()
  const all = cookieStore.getAll()
  for (const cookie of all) {
    const key = cookie.name.toLowerCase()
    if (key.startsWith("sb-") || key.includes("supabase") || key.includes("auth-token")) {
      response.headers.append(
        "Set-Cookie",
        `${cookie.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
      )
    }
  }
}

export async function POST(request: Request) {
  const response = Response.json({ ok: true, signedOut: true })
  await clearSupabaseCookies(response)

  if (!isServerSupabaseConfigured()) {
    return response
  }

  const token = bearer(request)
  if (token) {
    const client = createSupabaseUserClient(token)
    try {
      await client?.auth.signOut()
    } catch {
      // Local cache clear below is still the primary client-side path.
    }
  }

  return response
}
