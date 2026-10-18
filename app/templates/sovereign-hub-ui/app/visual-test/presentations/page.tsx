import { notFound } from "next/navigation"
import PresentationsVisualClient from "./PresentationsVisualClient"

export const metadata = {
  title: "Malik AI Presentations Visual Test",
  robots: { index: false, follow: false },
}

/** QA only: every layout in every design system, and the real studio with a demo deck. */
export default function PresentationsVisualPage() {
  if (process.env.NODE_ENV === "production" && process.env.GITHUB_ACTIONS !== "true") notFound()
  return <PresentationsVisualClient />
}
