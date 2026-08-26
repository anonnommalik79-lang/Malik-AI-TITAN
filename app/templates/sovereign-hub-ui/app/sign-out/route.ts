import { signOut } from "@workos-inc/authkit-nextjs"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { isWorkOSConfigured } from "@/lib/auth/server"

export const GET = async () => {
  const cookieStore = await cookies()
  const wasGuest = cookieStore.get("malik-guest")?.value === "1"
  cookieStore.delete("malik-guest")
  if (wasGuest) redirect("/auth")
  if (!isWorkOSConfigured()) redirect("/auth")
  await signOut({ returnTo: "/auth" })
}
