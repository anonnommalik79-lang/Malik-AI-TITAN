import { authkitProxy } from "@workos-inc/authkit-nextjs"
import { getWorkOSRedirectUri } from "@/lib/public-origin"

export default authkitProxy({
  redirectUri: getWorkOSRedirectUri(),
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
