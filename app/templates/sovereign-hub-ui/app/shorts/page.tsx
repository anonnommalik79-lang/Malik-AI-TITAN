import type { Metadata } from "next"
import { MalikShortsApp } from "@/components/sovereign/shorts/MalikShortsApp"
import { ShortsAuthorProfileOverlay } from "@/components/sovereign/shorts/ShortsAuthorProfileOverlay"
import { ShortsAutoSync } from "./ShortsAutoSync"
import { ShortsUXFixes } from "./ShortsUXFixes"
import "./shorts-final.css"
import "./shorts-profile-layout-fix.css"

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
  return (
    <>
      <ShortsAutoSync />
      <ShortsUXFixes />
      <div data-malik-shorts-page="1">
        <MalikShortsApp />
      </div>
      <ShortsAuthorProfileOverlay />
    </>
  )
}
