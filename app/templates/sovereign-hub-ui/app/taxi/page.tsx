import { redirect } from "next/navigation"
import { UberRealRideV1 } from "@/components/sovereign/taxi/UberRealRideV1"
import { getOptionalWorkOSAuth, isWorkOSConfigured } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function TaxiPage() {
  if (isWorkOSConfigured()) {
    const { user } = await getOptionalWorkOSAuth()
    if (!user?.id) redirect("/sign-in?returnTo=/taxi")
  }

  return <UberRealRideV1 />
}
