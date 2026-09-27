import { OsToolError } from "@/lib/os/failures"
import { osError, osJson, osOwner, requireSignedIn } from "@/lib/os/http"
import { pluginActions, pluginGrants, setPluginGrant } from "@/lib/os/plugin-actions"
import { readJsonBodyLimited } from "@/lib/server/request-safety"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Plugins as actions, with this account's permissions. */
export async function GET(request: Request) {
  try {
    const owner = await osOwner(request)
    const grants = owner.authenticated ? await pluginGrants(owner.userId) : {}
    return osJson({ ok: true, plugins: pluginActions().map((plugin) => ({ ...plugin, grant: grants[plugin.id] || null })) })
  } catch (error) {
    return osError(error)
  }
}

/** The permission screen's answer: allow once, allow always, or revoke. */
export async function POST(request: Request) {
  try {
    const owner = await osOwner(request)
    requireSignedIn(owner)
    const body = await readJsonBodyLimited<Record<string, unknown>>(request, 4 * 1024)
    const pluginId = String(body.pluginId || "")
    const mode = body.mode === "always" || body.mode === "once" || body.mode === "revoke" ? body.mode : null
    if (!mode || !/^[a-z0-9_-]{2,40}$/.test(pluginId)) throw new OsToolError("INVALID_REQUEST", "Неверный запрос разрешения.", { retryable: false })
    const grants = await setPluginGrant(owner.userId, pluginId, mode).catch(() => {
      throw new OsToolError("NOT_FOUND", "Плагин не найден.", { retryable: false })
    })
    return osJson({ ok: true, grant: grants[pluginId] || null })
  } catch (error) {
    return osError(error)
  }
}
