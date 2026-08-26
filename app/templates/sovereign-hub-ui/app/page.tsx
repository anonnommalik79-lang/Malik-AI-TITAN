import { redirect } from "next/navigation"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const { user } = await getOptionalWorkOSAuth()
  redirect(user ? "/dashboard" : "/auth")
}
