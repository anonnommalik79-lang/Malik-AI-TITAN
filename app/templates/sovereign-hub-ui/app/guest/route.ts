import { NextResponse, type NextRequest } from "next/server"
import { getPublicUrl } from "@/lib/public-origin"

export function GET(request: NextRequest) {
  // Render forwards requests to an internal localhost:<PORT> address.
  // Never build a browser redirect from request.url in production.
  const response = NextResponse.redirect(getPublicUrl("/dashboard"))
  const isHttps = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https"
  response.cookies.set("malik-guest", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
  })
  return response
}
