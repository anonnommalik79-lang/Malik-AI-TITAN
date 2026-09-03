import { NextResponse } from "next/server"

export function GET(request: Request) {
  // Keep the legacy endpoint alive for already-cached CSS, but send it to the
  // complete binary asset. The previous embedded base64 payload was truncated.
  const response = NextResponse.redirect(
    new URL("/images/malik-mobile-home-exact-8k.avif?v=2", request.url),
    307,
  )
  response.headers.set("Cache-Control", "public, max-age=300, must-revalidate")
  response.headers.set("X-Malik-Mobile-Reference", "exact-8k-avif-v4")
  return response
}
