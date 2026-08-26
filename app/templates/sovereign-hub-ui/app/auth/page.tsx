import SovereignVideoAuth from "@/components/sovereign/SovereignVideoAuth"
import PublicClientRedirect from "@/components/sovereign/PublicClientRedirect"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function AuthPage() {
  const { user } = await getOptionalWorkOSAuth()

  // Never emit a server-side Location header for an internal app route here.
  // On Render, the server can see an internal localhost origin. Client-side
  // relative navigation guarantees the browser stays on malikaiworld.world.
  if (user) return <PublicClientRedirect path="/dashboard" />

  return <SovereignVideoAuth />
}
