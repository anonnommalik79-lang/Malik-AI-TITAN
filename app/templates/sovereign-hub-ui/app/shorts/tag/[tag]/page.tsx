import { HashtagPage } from "@/components/sovereign/shorts/ShortsDiscoveryPages"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params
  const clean = decodeURIComponent(String(tag || "")).replace(/^#/, "").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 50)
  return <HashtagPage tag={clean} />
}
