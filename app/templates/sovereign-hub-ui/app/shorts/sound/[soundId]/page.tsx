import { SoundPage } from "@/components/sovereign/shorts/ShortsDiscoveryPages"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ soundId: string }> }) {
  const { soundId } = await params
  const clean = String(soundId || "").replace(/[^0-9a-f-]/gi, "").slice(0, 80)
  return <SoundPage soundId={clean} />
}
