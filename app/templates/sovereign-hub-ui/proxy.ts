import { authkitProxy } from "@workos-inc/authkit-nextjs"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { isWorkOSConfigured } from "@/lib/auth/server"

const workOSProxy = isWorkOSConfigured() ? authkitProxy({
  redirectUri: process.env.WORKOS_REDIRECT_URI || process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
}) : null

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return workOSProxy ? workOSProxy(request, event) : NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
