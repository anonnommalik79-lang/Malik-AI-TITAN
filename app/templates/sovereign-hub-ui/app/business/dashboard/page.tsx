import { redirect } from "next/navigation"
import { BusinessDashboardClient } from "@/components/sovereign/business/BusinessDashboardClient"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"

export const dynamic = "force-dynamic"

export default async function BusinessDashboardPage() {
  const { user } = await getOptionalWorkOSAuth()
  if (!isVerifiedOwner(user)) {
    redirect("/sign-in?returnTo=/business/dashboard")
  }

  return <BusinessDashboardClient ownerEmail={user?.email || ""} />
}
