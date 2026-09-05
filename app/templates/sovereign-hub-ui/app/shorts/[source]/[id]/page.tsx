import { redirect } from "next/navigation"
import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

const SOURCES = new Set(["malik", "youtube", "tiktok"])
const UUID = /^[0-9a-f-]{36}$/i

export default async function Page({ params }: { params: Promise<{ source: string; id: string }> }) {
  const { source: rawSource, id: rawId } = await params
  const source = String(rawSource || "").toLowerCase()
  const id = String(rawId || "").slice(0, 200)
  if (!SOURCES.has(source) || !id) redirect("/shorts")

  let shortId = source === "malik" && UUID.test(id) ? id : ""
  if (!shortId && getShortsSupabaseConfig()) {
    const rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_posts?select=id&source=eq.${encodeURIComponent(source)}&source_id=eq.${encodeURIComponent(id)}&limit=1`,
    ).catch(() => [])
    shortId = String(rows?.[0]?.id || "")
  }

  if (shortId) redirect(`/shorts?short=${encodeURIComponent(shortId)}`)
  redirect(`/shorts?source=${encodeURIComponent(source)}&sourceId=${encodeURIComponent(id)}`)
}
