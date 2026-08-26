import { getSignInUrl } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
import { isWorkOSConfigured } from "@/lib/auth/server"

export const GET = async () => {
  if (!isWorkOSConfigured()) redirect("/auth?error=workos_not_configured")
  redirect(await getSignInUrl())
}
