import { instagramConfigured } from "@/lib/instagram/client"
import { clearConnection, connectionStatus, instagramStorageReady } from "@/lib/instagram/store"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const headers = { "cache-control": "no-store", "x-malik-router": "instagram-connection-v1" }

/** Whether this account can publish, and as whom. */
export async function GET(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) {
    return Response.json({ ok: true, connected: false, authenticated: false, configured: instagramConfigured() }, { headers })
  }

  const status = await connectionStatus(entitlement.userId)
  return Response.json({
    ok: true,
    authenticated: true,
    configured: instagramConfigured(),
    ...status,
    storageReady: instagramStorageReady(),
    connectUrl: "/api/instagram/connect",
  }, { headers })
}

/**
 * Disconnecting forgets the token here. It does not revoke it inside
 * Instagram, and saying otherwise would be a lie about somebody's security —
 * the honest instruction is to remove Malik AI in Instagram's own settings.
 */
export async function DELETE(request: Request) {
  const entitlement = await resolveRequestEntitlement(request)
  if (!entitlement.authenticated) return Response.json({ ok: false, error: "Войдите в аккаунт." }, { status: 401, headers })

  await clearConnection(entitlement.userId)
  return Response.json({
    ok: true,
    connected: false,
    note: "Токен удалён с сервера. Чтобы полностью отозвать доступ, уберите Malik AI в настройках Instagram: Настройки → Безопасность → Приложения и сайты.",
  }, { headers })
}
