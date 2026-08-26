import { authkitProxy } from "@workos-inc/authkit-nextjs"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { isWorkOSConfigured } from "@/lib/auth/server"
import { getWorkOSRedirectUri } from "@/lib/public-origin"

const workOSProxy = isWorkOSConfigured() ? authkitProxy({
  redirectUri: getWorkOSRedirectUri(),
}) : null

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return workOSProxy ? workOSProxy(request, event) : NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
