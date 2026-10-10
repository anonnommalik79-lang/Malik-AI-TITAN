import { MalikShortsApp } from "@/components/sovereign/shorts/MalikShortsApp"
import { ShortsAuthorProfileOverlay } from "@/components/sovereign/shorts/ShortsAuthorProfileOverlay"

export function ShortsPage(_props: { path: string }) {
  // Public viewing is allowed; API actions still require authentication.
  return (
    <>
      <MalikShortsApp />
      <ShortsAuthorProfileOverlay />
    </>
  )
}
