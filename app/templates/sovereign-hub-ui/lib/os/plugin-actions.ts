import { MALIK_PLUGINS, getMalikPlugin } from "@/components/sovereign/features/plugin-registry"

import { readOwnerJson, writeOwnerJson } from "./store"

/**
 * Plugins as actions. Every plugin in the marketplace is an action with a
 * declared scope; nothing runs against a person's connected account until
 * they have allowed that plugin — once, or always. Plugin runners only read
 * (they call GET endpoints of the service), and that is what the permission
 * screen says.
 */

export type PluginGrant = { pluginId: string; mode: "always" | "once"; grantedAt: number }
type Grants = { grants: Record<string, PluginGrant> }

export function pluginActions() {
  return MALIK_PLUGINS.map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    category: plugin.category,
    runtime: plugin.runtime,
    needsConnection: plugin.runtime === "pipes",
    scope: "read" as const,
    reads: plugin.runtime === "pipes"
      ? `Читает данные вашего аккаунта ${plugin.name} (только чтение, в пределах выданного доступа).`
      : `Ищет в открытом API ${plugin.name}. Ваши данные не передаются.`,
    capabilities: plugin.capabilities,
  }))
}

export async function pluginGrants(ownerId: string) {
  return (await readOwnerJson<Grants>(ownerId, "plugin-grants"))?.grants || {}
}

export async function setPluginGrant(ownerId: string, pluginId: string, mode: "always" | "once" | "revoke") {
  if (!getMalikPlugin(pluginId)) throw new Error("PLUGIN_NOT_FOUND")
  const grants = await pluginGrants(ownerId)
  if (mode === "revoke") delete grants[pluginId]
  else grants[pluginId] = { pluginId, mode, grantedAt: Date.now() }
  await writeOwnerJson(ownerId, "plugin-grants", { grants })
  return grants
}

/** Public, read-only plugins need no grant; connected ones do. A "once" grant is used up. */
export async function consumePluginPermission(ownerId: string, pluginId: string) {
  const plugin = getMalikPlugin(pluginId)
  if (!plugin) return { ok: false as const, reason: "not-found" as const }
  if (plugin.runtime === "public") return { ok: true as const }
  const grants = await pluginGrants(ownerId)
  const grant = grants[pluginId]
  if (!grant) return { ok: false as const, reason: "permission" as const }
  if (grant.mode === "once") {
    delete grants[pluginId]
    await writeOwnerJson(ownerId, "plugin-grants", { grants })
  }
  return { ok: true as const }
}
