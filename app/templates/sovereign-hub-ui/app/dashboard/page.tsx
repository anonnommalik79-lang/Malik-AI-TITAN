import Dashboard from "@/components/sovereign/dashboard"
import { AccountChatPersistence } from "@/components/sovereign/AccountChatPersistence"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const { user } = await getOptionalWorkOSAuth()
  const guestMode = (await cookies()).get("malik-guest")?.value === "1"
  if (!user && !guestMode) redirect("/auth")

  const accountId = user?.id || user?.email || "guest"

  return (
    <AccountChatPersistence accountId={accountId}>
      <div data-malik-dashboard-page className="malik-dashboard-page-guard">
        <Dashboard guestMode={!user && guestMode} />
        <style>{`.malik-dashboard-page-guard{width:100vw;min-height:100dvh;overflow-x:hidden;background:#000}.malik-dashboard-page-guard main,.malik-dashboard-page-guard [data-dashboard-root],.malik-dashboard-page-guard [data-sovereign-dashboard]{max-width:100vw}`}</style>
      </div>
    </AccountChatPersistence>
  )
}
