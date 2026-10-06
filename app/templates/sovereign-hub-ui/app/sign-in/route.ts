import { getSignInUrl } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
import { isWorkOSConfigured } from "@/lib/auth/server"
import { getPublicOrigin, getPublicUrl, getWorkOSRedirectUri } from "@/lib/public-origin"
import { shortsPath } from "@/lib/youtube/contracts"

export const dynamic = "force-dynamic"

export const GET = async (request: Request) => {
  if (!isWorkOSConfigured()) redirect(getPublicUrl("/auth?error=workos_not_configured"))

  const requestUrl = new URL(request.url)
  const canonicalOrigin = getPublicOrigin()

  // PKCE verifier cookies are host-bound. If somebody opens an old Render URL,
  // www alias or another host, move them to the canonical Malik AI domain
  // BEFORE creating the WorkOS sign-in state so the callback receives the
  // exact same verifier cookie.
  if (requestUrl.origin !== canonicalOrigin) {
    const canonical = new URL("/sign-in", canonicalOrigin)
    canonical.search = requestUrl.search
    redirect(canonical.toString())
  }

  const requested = requestUrl.searchParams.get("returnTo") || ""
  const returnTo = requested.startsWith("/shorts") ? shortsPath(requested) : "/dashboard"

  redirect(await getSignInUrl({
    returnTo,
    redirectUri: getWorkOSRedirectUri(),
  }))
}
