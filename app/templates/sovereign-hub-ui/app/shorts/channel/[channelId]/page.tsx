import { notFound } from "next/navigation"
import { ShortsPage } from "../../ShortsPage"
import { channelIdValid } from "@/lib/youtube/contracts"
export const dynamic = "force-dynamic"
export default async function Page({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params
  if (!channelIdValid(channelId)) notFound()
  return <ShortsPage path={`/shorts/channel/${channelId}`} />
}
