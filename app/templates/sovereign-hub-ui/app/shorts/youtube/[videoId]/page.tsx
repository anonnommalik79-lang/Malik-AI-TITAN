import { notFound } from "next/navigation"
import { ShortsPage } from "../../ShortsPage"
import { videoIdValid } from "@/lib/youtube/contracts"
export const dynamic = "force-dynamic"
export default async function Page({ params, searchParams }: { params: Promise<{ videoId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { videoId } = await params
  if (!videoIdValid(videoId)) notFound()
  const query = await searchParams
  const start = Number(query.start)
  const suffix = Number.isFinite(start) && start > 0 ? `?start=${Math.min(86400, Math.floor(start))}` : ""
  return <ShortsPage path={`/shorts/youtube/${videoId}${suffix}`} />
}
