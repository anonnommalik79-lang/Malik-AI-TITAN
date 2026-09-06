import { getSignInUrl } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
import { isWorkOSConfigured } from "@/lib/auth/server"
import { getPublicUrl } from "@/lib/public-origin"
import { shortsPath } from "@/lib/youtube/contracts"

export const GET = async (request: Request) => {
  if (!isWorkOSConfigured()) redirect(getPublicUrl("/auth?error=workos_not_configured"))
  const requested = new URL(request.url).searchParams.get("returnTo") || ""
  const returnTo = requested.startsWith("/shorts") ? shortsPath(requested) : "/dashboard"
  redirect(await getSignInUrl({ returnTo }))
}
