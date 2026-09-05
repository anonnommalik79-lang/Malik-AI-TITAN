import { ShortsLiveRoom } from "@/components/sovereign/shorts/ShortsLiveRoom"

export const dynamic = "force-dynamic"

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const query = await searchParams
  const liveId = String(query.id || "").replace(/[^0-9a-f-]/gi, "").slice(0, 80)
  return <ShortsLiveRoom liveId={liveId} />
}
