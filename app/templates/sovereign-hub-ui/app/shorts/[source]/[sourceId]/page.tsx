import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

type PageProps = { params: Promise<{ source: string; sourceId: string }> }

export default async function MalikShortDeepLinkPage({ params }: PageProps) {
  const { source, sourceId } = await params
  const cleanSource = ["malik", "youtube", "tiktok"].includes(source) ? source : "malik"
  const cleanId = String(sourceId || "").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 180)
  const query = new URLSearchParams({ source: cleanSource, short: cleanId })
  redirect(`/shorts?${query.toString()}`)
}
