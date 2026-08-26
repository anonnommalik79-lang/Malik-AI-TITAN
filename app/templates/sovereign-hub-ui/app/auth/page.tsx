import SovereignVideoAuth from "@/components/sovereign/SovereignVideoAuth"
import { redirect } from "next/navigation"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function AuthPage() {
  const { user } = await getOptionalWorkOSAuth()
  if (user) redirect("/dashboard")
  return <SovereignVideoAuth />
}
