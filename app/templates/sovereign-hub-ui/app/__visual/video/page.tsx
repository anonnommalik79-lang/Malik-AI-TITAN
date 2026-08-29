import { notFound } from "next/navigation"
import VisualVideoClient from "./VisualVideoClient"

export default function VisualVideoPage() {
  if (process.env.GITHUB_ACTIONS !== "true") notFound()
  return <VisualVideoClient />
}
