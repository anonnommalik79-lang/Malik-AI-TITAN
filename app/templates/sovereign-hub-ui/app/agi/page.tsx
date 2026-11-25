import type { Metadata } from "next"
import { redirect } from "next/navigation"
import MalikAgiConsole from "@/components/agi/MalikAgiConsole"
import { resolveViewerEntitlement } from "@/lib/server/request-entitlement"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "MALIK AGI Research Beta | Sovereign Hub",
  description: "Экспериментальная система четырёх AI-агентов с проверяемой генерацией Node.js CLI.",
  robots: { index: false, follow: false },
}

export default async function MalikAgiPage() {
  const viewer = await resolveViewerEntitlement()
  if (!viewer?.authenticated || viewer.plan !== "owner") redirect("/dashboard")
  return <MalikAgiConsole />
}
