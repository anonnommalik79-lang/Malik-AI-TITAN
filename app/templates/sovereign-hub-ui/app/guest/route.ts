import { NextResponse, type NextRequest } from "next/server"
import { guestRedirectOrigin } from "@/lib/auth/guest-origin"
import { guestEntryPath } from "@/lib/auth/entry-target"

export function GET(request: NextRequest) {
  // Render forwards requests to an internal localhost:<PORT> address.
  // Never build a browser redirect from request.url in production.
  const response = NextResponse.redirect(new URL(guestEntryPath(request.nextUrl.searchParams.get("feature")), guestRedirectOrigin(request)))
  const isHttps = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https"
  response.cookies.set("malik-guest", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
  })
  return response
}
