import { redirect } from "next/navigation"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { MalikShortsApp } from "@/components/sovereign/shorts/MalikShortsApp"
export async function ShortsPage({ path }: { path: string }) {
  const { user } = await getOptionalWorkOSAuth()
  if (!user) redirect("/sign-in?returnTo=" + encodeURIComponent(path))
  return <MalikShortsApp />
}
