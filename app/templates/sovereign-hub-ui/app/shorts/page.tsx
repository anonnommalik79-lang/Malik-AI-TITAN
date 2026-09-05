import type { Metadata } from "next"
import { MalikShortsAppV2 } from "@/components/sovereign/shorts/MalikShortsAppV2"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Malik Shorts",
  description: "Malik Shorts — короткие видео, авторы, рекомендации и AI-инструменты внутри Malik AI.",
  alternates: { canonical: "/shorts" },
  openGraph: {
    title: "Malik Shorts",
    description: "Короткие видео и AI-социальная сеть внутри Malik AI.",
    url: "https://malikaiworld.world/shorts",
    type: "website",
  },
}

export default function MalikShortsPage() {
  return <MalikShortsAppV2 />
}
