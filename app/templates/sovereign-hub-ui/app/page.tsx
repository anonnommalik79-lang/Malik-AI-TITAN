import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { getPublicUrl } from "@/lib/public-origin"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const { user } = await getOptionalWorkOSAuth()
  const guestMode = (await cookies()).get("malik-guest")?.value === "1"
  redirect(getPublicUrl(user || guestMode ? "/dashboard" : "/auth"))
}
