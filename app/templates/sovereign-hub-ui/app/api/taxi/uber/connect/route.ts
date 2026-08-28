import { getPublicUrl } from "@/lib/public-origin"
import { createUberAuthorizationUrl, publicUberError } from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const authorizationUrl = await createUberAuthorizationUrl()
    return Response.redirect(authorizationUrl, 302)
  } catch (error) {
    const failure = publicUberError(error)
    if (failure.code === "MALIK_AUTH_REQUIRED") {
      const signIn = new URL("/sign-in", getPublicUrl("/"))
      signIn.searchParams.set("returnTo", "/api/taxi/uber/connect")
      return Response.redirect(signIn.toString(), 302)
    }
    const taxi = new URL("/taxi", getPublicUrl("/"))
    taxi.searchParams.set("uber", "connect-error")
    taxi.searchParams.set("code", failure.code.slice(0, 80))
    return Response.redirect(taxi.toString(), 302)
  }
}
