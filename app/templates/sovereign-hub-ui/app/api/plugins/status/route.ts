import { MALIK_PLUGINS } from "@/components/sovereign/features/plugin-registry"
import { getPluginSessionUser, listPipesProviders } from "@/lib/server/plugin-pipes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getPluginSessionUser()
  try {
    const providers = user?.id ? await listPipesProviders(user.id) : []
    const bySlug = new Map(providers.map((provider) => [provider.slug, provider]))
    const plugins = MALIK_PLUGINS.map((plugin) => {
      if (plugin.runtime === "public") return { id: plugin.id, state: "public" }

      const provider = bySlug.get(plugin.providerSlug)
      const account = provider?.connected_account
      const authMethods = Array.isArray(provider?.auth_methods) ? provider.auth_methods : []
      const connectable = authMethods.some((method) => ["oauth", "api_key"].includes(String(method).toLowerCase()))
      const state = !user?.id
        ? "sign_in"
        : !provider || (!connectable && account?.state !== "connected")
          ? "unavailable"
          : account?.state === "connected"
            ? "connected"
            : account?.state === "needs_reauthorization"
              ? "reauthorize"
              : "available"

      return {
        id: plugin.id,
        state,
        providerName: provider?.name || plugin.name,
        authMethods,
        scopes: provider?.scopes || [],
        grantedScopes: account?.scopes || [],
        accountName: account?.account_display_name || null,
      }
    })

    return Response.json({ ok: true, plugins }, { headers: { "cache-control": "private, no-store" } })
  } catch {
    return Response.json({ ok: false, error: "plugin_status_unavailable" }, {
      status: 503,
      headers: { "cache-control": "private, no-store" },
    })
  }
}
