import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const clean = String(username || "").replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 32)
  if (!clean) redirect("/shorts")
  redirect(`/shorts/profile?username=${encodeURIComponent(clean)}`)
}
