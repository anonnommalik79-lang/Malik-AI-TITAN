import { handleAuth } from "@workos-inc/authkit-nextjs"
import { isWorkOSConfigured } from "@/lib/auth/server"
import { getPublicOrigin, getPublicUrl } from "@/lib/public-origin"

const workOSCallback = handleAuth({
  returnPathname: "/dashboard",
  baseURL: getPublicOrigin(),
  onError: async ({ error }) => {
    // Never strand a user on WorkOS' generic error surface. The sign-in route
    // starts a fresh PKCE flow on the canonical domain when they retry.
    console.error("[Malik auth] WorkOS callback failed", error)
    return Response.redirect(getPublicUrl("/auth?error=signin_failed"), 303)
  },
})

export async function GET(request: Parameters<typeof workOSCallback>[0]) {
  if (!isWorkOSConfigured()) {
    return Response.redirect(getPublicUrl("/auth?error=workos_not_configured"), 303)
  }

  const callbackUrl = new URL(request.url)
  if (!callbackUrl.searchParams.get("code")) {
    return Response.redirect(getPublicUrl("/auth?error=signin_failed"), 303)
  }

  return workOSCallback(request)
}
