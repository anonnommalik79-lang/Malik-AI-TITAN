import { redirect } from "next/navigation"
import { UberTaxiStudio } from "@/components/sovereign/taxi/UberTaxiStudio"
import { getOptionalWorkOSAuth, isWorkOSConfigured } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function TaxiPage() {
  if (isWorkOSConfigured()) {
    const { user } = await getOptionalWorkOSAuth()
    if (!user?.id) redirect("/sign-in?returnTo=/taxi")
  }

  return <UberTaxiStudio />
}
