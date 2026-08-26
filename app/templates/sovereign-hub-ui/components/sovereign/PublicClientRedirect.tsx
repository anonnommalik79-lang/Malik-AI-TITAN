"use client"

import { useEffect } from "react"

export default function PublicClientRedirect({ path }: { path: string }) {
  useEffect(() => {
    const target = path.startsWith("/") ? path : `/${path}`
    // Same-origin browser navigation only. This can never leak Render's
    // internal localhost host/port into the user's address bar.
    window.location.replace(target)
  }, [path])

  return <main style={{ minHeight: "100dvh", background: "#000" }} aria-hidden="true" />
}
