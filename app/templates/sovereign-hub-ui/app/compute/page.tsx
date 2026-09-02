import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Dashboard from "@/components/sovereign/dashboard"
import { AccountChatPersistence } from "@/components/sovereign/AccountChatPersistence"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Malik Compute | Malik AI" }

export default async function ComputePage() {
  const { user } = await getOptionalWorkOSAuth()
  const guestMode = (await cookies()).get("malik-guest")?.value === "1"
  if (!user && !guestMode) redirect("/auth")

  const accountId = user?.id || user?.email || "guest"

  return (
    <AccountChatPersistence accountId={accountId}>
      <Dashboard guestMode={!user && guestMode} initialView="compute" />
    </AccountChatPersistence>
  )
}
