import { getPublicUrl } from "@/lib/public-origin"
import { finishUberAuthorization, publicUberError } from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = String(url.searchParams.get("code") || "")
  const state = String(url.searchParams.get("state") || "")
  const providerError = String(url.searchParams.get("error") || "")

  if (providerError) {
    const taxi = new URL("/taxi", getPublicUrl("/"))
    taxi.searchParams.set("uber", "oauth-denied")
    taxi.searchParams.set("code", providerError.slice(0, 80))
    return Response.redirect(taxi.toString(), 302)
  }

  try {
    await finishUberAuthorization(code, state)
    const taxi = new URL("/taxi", getPublicUrl("/"))
    taxi.searchParams.set("uber", "connected")
    return Response.redirect(taxi.toString(), 302)
  } catch (error) {
    const failure = publicUberError(error)
    const taxi = new URL("/taxi", getPublicUrl("/"))
    taxi.searchParams.set("uber", "oauth-error")
    taxi.searchParams.set("code", failure.code.slice(0, 80))
    return Response.redirect(taxi.toString(), 302)
  }
}
