import { redirect } from "next/navigation"
import { getShortsSupabaseConfig, shortsSupabaseRequest } from "@/lib/shorts/server"

export const dynamic = "force-dynamic"

type PageProps = { params: Promise<{ source: string; sourceId: string }> }
const UUID = /^[0-9a-f-]{36}$/i

export default async function MalikShortDeepLinkPage({ params }: PageProps) {
  const { source: rawSource, sourceId: rawSourceId } = await params
  const source = ["malik", "youtube", "tiktok"].includes(rawSource) ? rawSource : "malik"
  const sourceId = String(rawSourceId || "").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 180)
  if (!sourceId) redirect("/shorts")

  let shortId = source === "malik" && UUID.test(sourceId) ? sourceId : ""
  if (!shortId && getShortsSupabaseConfig()) {
    const rows = await shortsSupabaseRequest<any[]>(
      `malik_shorts_posts?select=id&source=eq.${encodeURIComponent(source)}&source_id=eq.${encodeURIComponent(sourceId)}&limit=1`,
    ).catch(() => [])
    shortId = String(rows?.[0]?.id || "")
  }

  if (shortId) redirect(`/shorts?short=${encodeURIComponent(shortId)}`)
  const query = new URLSearchParams({ source, sourceId })
  redirect(`/shorts?${query.toString()}`)
}
