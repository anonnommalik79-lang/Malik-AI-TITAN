import { cookies } from "next/headers"
import PublicClientRedirect from "@/components/sovereign/PublicClientRedirect"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const { user } = await getOptionalWorkOSAuth()
  const guestMode = (await cookies()).get("malik-guest")?.value === "1"

  // Use a relative browser redirect so the public domain is preserved even
  // when Render's internal request origin is localhost:<PORT>.
  return <PublicClientRedirect path={user || guestMode ? "/dashboard" : "/auth"} />
}
