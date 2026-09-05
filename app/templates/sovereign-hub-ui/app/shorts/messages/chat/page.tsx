import { ShortsMessagesPage } from "@/components/sovereign/shorts/ShortsMessagesPage"

export const dynamic = "force-dynamic"

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const query = await searchParams
  const clean = String(query.id || "").replace(/[^0-9a-f-]/gi, "").slice(0, 80)
  return <ShortsMessagesPage conversationId={clean} />
}
