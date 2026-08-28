import { getMalikPlugin } from "@/components/sovereign/features/plugin-registry"
import { createPipesAuthorization, getPluginSessionUser } from "@/lib/server/plugin-pipes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeReturnTo(request: Request, value?: string | null) {
  const current = new URL(request.url)
  const fallback = new URL("/dashboard", current.origin)
  if (!value) return fallback.toString()
  try {
    const candidate = new URL(value, current.origin)
    if (candidate.origin !== current.origin) return fallback.toString()
    return candidate.toString()
  } catch {
    return fallback.toString()
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const plugin = getMalikPlugin(url.searchParams.get("id"))

  if (!plugin) {
    return Response.json({ ok: false, error: "plugin_not_found" }, { status: 404 })
  }
  if (plugin.runtime !== "pipes" || !plugin.providerSlug) {
    return Response.redirect(safeReturnTo(request, url.searchParams.get("return_to")), 302)
  }

  const user = await getPluginSessionUser()
  if (!user?.id) {
    const signIn = new URL("/sign-in", url.origin)
    signIn.searchParams.set("returnTo", url.pathname + url.search)
    return Response.redirect(signIn, 302)
  }

  try {
    const authorizationUrl = await createPipesAuthorization(
      user.id,
      plugin.providerSlug,
      safeReturnTo(request, url.searchParams.get("return_to")),
    )
    return Response.redirect(authorizationUrl, 302)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start plugin authorization"
    return Response.json({
      ok: false,
      error: "plugin_provider_not_configured",
      plugin: plugin.id,
      provider: plugin.providerSlug,
      message,
      hint: "Enable this provider in WorkOS Dashboard -> Pipes, then retry. Malik AI never asks the browser to store the provider token.",
    }, { status: 409, headers: { "cache-control": "no-store" } })
  }
}
