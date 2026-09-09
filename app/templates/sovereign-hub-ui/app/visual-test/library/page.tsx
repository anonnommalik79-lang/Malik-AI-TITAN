import { notFound } from "next/navigation"
import { Suspense } from "react"
import { SiteLibraryPanel } from "@/components/sovereign/library/SiteLibraryPanel"

export const dynamic = "force-dynamic"

/**
 * Somewhere to look at the Library without signing in.
 *
 * The panel only renders inside the dashboard, which is behind WorkOS, so every
 * layout change had to be checked by describing it rather than by looking. This
 * host renders the panel on its own - same gate as the Shorts test host: dev
 * builds only, and only with the flag set, so it cannot appear in production.
 */
export default function LibraryTestHost() {
  if (process.env.NODE_ENV !== "development" || process.env.MALIK_LIBRARY_TEST_UI !== "1") notFound()
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Suspense>
        <SiteLibraryPanel />
      </Suspense>
    </div>
  )
}
