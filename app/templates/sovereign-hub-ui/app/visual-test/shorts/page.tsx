import { notFound } from "next/navigation"
import { Suspense } from "react"
import { MalikShortsApp } from "@/components/sovereign/shorts/MalikShortsApp"

export const dynamic = "force-dynamic"

export default function ShortsTestHost() {
  // UI test host only. Real API routes still enforce WorkOS + OAuth.
  if (process.env.NODE_ENV !== "development" || process.env.MALIK_SHORTS_TEST_UI !== "1") notFound()
  return (
    <Suspense>
      <MalikShortsApp />
    </Suspense>
  )
}
