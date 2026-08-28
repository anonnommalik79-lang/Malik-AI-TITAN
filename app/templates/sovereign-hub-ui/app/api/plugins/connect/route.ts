import { getMalikPlugin } from "@/components/sovereign/features/plugin-registry"
import { getPublicOrigin } from "@/lib/public-origin"
import {
  createPipesAuthorization,
  getPipesProviderState,
  getPluginSessionUser,
  upsertPipesApiKey,
} from "@/lib/server/plugin-pipes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeReturnTo(_request: Request, value?: string | null) {
  const publicOrigin = getPublicOrigin()
  const fallback = new URL("/dashboard", publicOrigin)
  if (!value) return fallback.toString()
  try {
    const candidate = new URL(value, publicOrigin)
    if (candidate.origin !== publicOrigin) return fallback.toString()
    return candidate.toString()
  } catch {
    return fallback.toString()
  }
}

function returnWithStatus(request: Request, returnTo: string, pluginId: string, status: "connected" | "error") {
  const target = new URL(safeReturnTo(request, returnTo))
  target.searchParams.set("plugin", pluginId)
  target.searchParams.set("plugin_status", status)
  return target.toString()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function apiKeyPage(request: Request, pluginId: string, pluginName: string, returnTo: string) {
  const action = new URL("/api/plugins/connect", getPublicOrigin())
  const safeName = escapeHtml(pluginName)
  const safeId = escapeHtml(pluginId)
  const safeReturn = escapeHtml(safeReturnTo(request, returnTo))

  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>Подключить ${safeName} · Malik AI</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080809;color:#f4f4f5;font:14px Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px}
    main{width:min(100%,460px);background:#111113;border:1px solid #252529;border-radius:22px;padding:28px;box-shadow:0 30px 90px rgba(0,0,0,.45)}
    .k{font-size:10px;letter-spacing:.14em;color:#777780;font-weight:700}.h{font-size:26px;font-weight:650;letter-spacing:-.035em;margin:9px 0 8px}.p{color:#94949d;line-height:1.6;margin:0 0 22px}
    label{display:block;font-size:12px;color:#c8c8ce;margin-bottom:8px}input{width:100%;height:46px;border-radius:12px;border:1px solid #303035;background:#09090a;color:#fff;padding:0 13px;outline:none}input:focus{border-color:#62626c}
    button{width:100%;height:46px;border:0;border-radius:12px;background:#f4f4f5;color:#111;font-weight:700;margin-top:14px;cursor:pointer}.n{font-size:11px;color:#6f6f78;line-height:1.55;margin-top:14px}.b{display:inline-block;margin-top:18px;color:#9d9da6;text-decoration:none;font-size:12px}
  </style>
</head>
<body>
  <main>
    <div class="k">MALIK AI · SECURE CONNECTION</div>
    <div class="h">${safeName}</div>
    <p class="p">Этот сервис подключается API‑ключом. Ключ отправляется только на сервер Malik AI и сразу сохраняется в защищённом WorkOS Pipes/Vault. В браузере и localStorage он не хранится.</p>
    <form method="post" action="${escapeHtml(action.toString())}" autocomplete="off">
      <input type="hidden" name="id" value="${safeId}" />
      <input type="hidden" name="return_to" value="${safeReturn}" />
      <label for="secret">API key / token</label>
      <input id="secret" name="secret" type="password" required maxlength="8192" autocomplete="new-password" spellcheck="false" />
      <button type="submit">Подключить к Malik AI</button>
    </form>
    <div class="n">Malik AI не показывает и не возвращает введённый ключ после сохранения. Удалить или заменить подключение можно через настройки провайдера.</div>
    <a class="b" href="${safeReturn}">← Назад в Malik AI</a>
  </main>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  })
}

function providerNotConfigured(pluginId: string, providerSlug: string, message?: string) {
  return Response.json({
    ok: false,
    error: "plugin_provider_not_configured",
    plugin: pluginId,
    provider: providerSlug,
    message: message || "This provider is not enabled in the current WorkOS Pipes environment.",
    hint: "Enable the provider in WorkOS Dashboard -> Pipes with the scopes Malik AI needs, then retry. Production OAuth providers may require your own provider client ID/secret.",
  }, { status: 409, headers: { "cache-control": "no-store" } })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const plugin = getMalikPlugin(url.searchParams.get("id"))
  const returnTo = url.searchParams.get("return_to") || "/dashboard"

  if (!plugin) {
    return Response.json({ ok: false, error: "plugin_not_found" }, { status: 404 })
  }
  if (plugin.runtime !== "pipes" || !plugin.providerSlug) {
    return Response.redirect(safeReturnTo(request, returnTo), 302)
  }

  const user = await getPluginSessionUser()
  if (!user?.id) {
    const signIn = new URL("/sign-in", getPublicOrigin())
    signIn.searchParams.set("returnTo", url.pathname + url.search)
    return Response.redirect(signIn, 302)
  }

  try {
    const state = await getPipesProviderState(user.id, plugin.providerSlug)
    if (!state.configured || !state.provider) {
      return providerNotConfigured(plugin.id, plugin.providerSlug)
    }
    if (state.connected) {
      return Response.redirect(returnWithStatus(request, returnTo, plugin.id, "connected"), 302)
    }

    const methods = state.authMethods.map((method) => String(method).toLowerCase())
    if (methods.includes("api_key") && !methods.includes("oauth")) {
      return apiKeyPage(request, plugin.id, plugin.name, returnTo)
    }

    if (!methods.includes("oauth")) {
      return providerNotConfigured(plugin.id, plugin.providerSlug, `Configured auth method is not supported by this connector: ${methods.join(", ") || "unknown"}`)
    }

    const authorizationUrl = await createPipesAuthorization(
      user.id,
      plugin.providerSlug,
      safeReturnTo(request, returnTo),
    )
    return Response.redirect(authorizationUrl, 302)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start plugin authorization"
    return providerNotConfigured(plugin.id, plugin.providerSlug, message)
  }
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const publicOrigin = getPublicOrigin()
  const origin = request.headers.get("origin")
  if (origin) {
    try {
      if (new URL(origin).origin !== publicOrigin) {
        return Response.json({ ok: false, error: "invalid_origin" }, { status: 403 })
      }
    } catch {
      return Response.json({ ok: false, error: "invalid_origin" }, { status: 403 })
    }
  }

  const form = await request.formData().catch(() => null)
  const plugin = getMalikPlugin(String(form?.get("id") || ""))
  const returnTo = String(form?.get("return_to") || "/dashboard")
  const secret = String(form?.get("secret") || "").trim()

  if (!plugin || plugin.runtime !== "pipes" || !plugin.providerSlug) {
    return Response.json({ ok: false, error: "plugin_not_found" }, { status: 404 })
  }

  const user = await getPluginSessionUser()
  if (!user?.id) {
    const signIn = new URL("/sign-in", publicOrigin)
    signIn.searchParams.set("returnTo", requestUrl.pathname + requestUrl.search)
    return Response.redirect(signIn, 303)
  }

  try {
    const state = await getPipesProviderState(user.id, plugin.providerSlug)
    const methods = state.authMethods.map((method) => String(method).toLowerCase())
    if (!state.configured || !methods.includes("api_key")) {
      return providerNotConfigured(plugin.id, plugin.providerSlug, "This provider is not configured for API-key connections.")
    }
    if (!secret) {
      return Response.json({ ok: false, error: "api_key_required" }, { status: 400 })
    }

    await upsertPipesApiKey(user.id, plugin.providerSlug, secret)
    return Response.redirect(returnWithStatus(request, returnTo, plugin.id, "connected"), 303)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to store provider API key"
    return Response.json({ ok: false, error: "plugin_connection_failed", plugin: plugin.id, message }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    })
  }
}
