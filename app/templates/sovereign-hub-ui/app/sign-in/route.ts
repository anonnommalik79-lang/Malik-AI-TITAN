import { getSignInUrl } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
import { isWorkOSConfigured } from "@/lib/auth/server"
import { getPublicUrl } from "@/lib/public-origin"

export const GET = async () => {
  if (!isWorkOSConfigured()) redirect(getPublicUrl("/auth?error=workos_not_configured"))
  redirect(await getSignInUrl())
}
