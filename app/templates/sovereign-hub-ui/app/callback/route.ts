import { handleAuth } from "@workos-inc/authkit-nextjs"
import { isWorkOSConfigured } from "@/lib/auth/server"
import { getPublicOrigin } from "@/lib/public-origin"

const workOSCallback = handleAuth({
  returnPathname: "/dashboard",
  baseURL: getPublicOrigin(),
})

export async function GET(request: Parameters<typeof workOSCallback>[0]) {
  if (!isWorkOSConfigured()) {
    return Response.json({
      ok: false,
      error: "workos_not_configured",
      message: "Set WORKOS_CLIENT_ID and WORKOS_API_KEY in .env.local.",
    }, { status: 503 })
  }

  const callbackUrl = new URL(request.url)
  if (!callbackUrl.searchParams.get("code")) {
    return Response.json({
      ok: false,
      error: "invalid_workos_callback",
      message: "The WorkOS callback is missing its authorization code.",
    }, { status: 400 })
  }

  return workOSCallback(request)
}
