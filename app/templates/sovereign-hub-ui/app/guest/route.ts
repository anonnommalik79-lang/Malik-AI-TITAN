import { NextResponse, type NextRequest } from "next/server"

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/dashboard", request.url))
  const isHttps = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https"
  response.cookies.set("malik-guest", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
  })
  return response
}
