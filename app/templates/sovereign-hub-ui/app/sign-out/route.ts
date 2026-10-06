import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { isWorkOSConfigured } from "@/lib/auth/server"
import { getPublicUrl } from "@/lib/public-origin"

export const dynamic = "force-dynamic"

type CookieStore = Awaited<ReturnType<typeof cookies>>

function clearCookie(store: CookieStore, name: string) {
  const domain = process.env.WORKOS_COOKIE_DOMAIN?.trim() || undefined
  const sameSiteRaw = (process.env.WORKOS_COOKIE_SAMESITE || "lax").toLowerCase()
  const sameSite = sameSiteRaw === "strict" || sameSiteRaw === "none" ? sameSiteRaw : "lax"
  const secure = process.env.NODE_ENV === "production" || sameSite === "none"

  try {
    store.delete({ name, domain, path: "/", sameSite, secure })
  } catch {
    store.delete(name)
  }
}

export const GET = async () => {
  const cookieStore = await cookies()
  const wasGuest = cookieStore.get("malik-guest")?.value === "1"
  cookieStore.delete("malik-guest")

  const sessionCookieName = process.env.WORKOS_COOKIE_NAME?.trim() || "wos-session"

  // Do not send users through WorkOS' hosted logout/error page. End the
  // WorkOS session server-side, clear the local session, then return straight
  // to Malik AI. A failed remote revoke must never trap the user on logout.
  if (!wasGuest && isWorkOSConfigured()) {
    try {
      const { sessionId } = await withAuth()
      if (sessionId) {
        try {
          await getWorkOS().userManagement.revokeSession({ sessionId })
        } catch (error) {
          console.error("[Malik auth] WorkOS session revoke failed; continuing local sign-out", error)
        }
      }
    } catch (error) {
      console.error("[Malik auth] Could not read WorkOS session during sign-out", error)
    }
  }

  clearCookie(cookieStore, sessionCookieName)

  // Remove abandoned PKCE verifiers so a cancelled/old login cannot poison
  // the next sign-in attempt on iOS or another browser tab.
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("wos-auth-verifier")) clearCookie(cookieStore, name)
  }

  redirect(getPublicUrl("/auth"))
}
