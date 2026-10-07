// Run after npm run build. Starts the real Next.js server with test-only
// credentials; no provider sign-in, user account or external API call is made.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import http from "node:http"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const port = 3114
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, RENDER: "true", WORKOS_CLIENT_ID: "client_auth_redirect_fixture", WORKOS_API_KEY: "sk_test_auth_redirect_fixture", WORKOS_COOKIE_PASSWORD: "auth_redirect_fixture_012345678901234567890123456789", WORKOS_COOKIE_SAMESITE: "lax", WORKOS_COOKIE_DOMAIN: "", WORKOS_REDIRECT_URI: "https://malikaiworld.world/callback" },
})
function request(route, host = "malikaiworld.world") {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: route, headers: { host, "x-forwarded-proto": "https" } }, (response) => {
      response.resume()
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers }))
    })
    req.on("error", reject)
    req.setTimeout(10000, () => req.destroy(new Error("Local auth request timed out")))
  })
}
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Next.js server did not become ready")), 15000)
    server.once("error", (error) => { clearTimeout(timer); reject(error) })
    server.once("exit", () => { clearTimeout(timer); reject(new Error("Next.js server exited before the check")) })
    let log = ""
    server.stderr.on("data", () => {})
    server.stdout.on("data", (data) => {
      log = (log + data.toString()).slice(-2000)
      if (log.includes("Ready in")) { clearTimeout(timer); resolve() }
    })
  })
  for (const [provider, expected] of [["google", "GoogleOAuth"], ["apple", "AppleOAuth"], ["microsoft", "MicrosoftOAuth"], ["email", "authkit"]]) {
    const result = await request(`/sign-in?provider=${provider}`)
    assert.equal(result.status, 307)
    const target = new URL(result.headers.location)
    assert.equal(target.origin, "https://api.workos.com", "A canonical request leaves Malik AI in one hop")
    assert.equal(target.searchParams.get("provider"), expected)
    assert.equal(target.searchParams.get("redirect_uri"), "https://malikaiworld.world/callback")
    for (const key of ["state", "code_challenge"]) assert(target.searchParams.get(key), `SDK generates ${key}`)
    assert.equal(target.searchParams.get("code_challenge_method"), "S256")
    const cookies = result.headers["set-cookie"]?.filter((cookie) => cookie.startsWith("wos-auth-verifier")) || []
    assert.equal(cookies.length, 1)
    for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax"]) assert(cookies[0].toLowerCase().includes(attribute.toLowerCase()), `Verifier is ${attribute}`)
    console.log(`PASS actual Next.js: ${provider} → WorkOS in one hop, secure SDK PKCE cookie`)
  }
  const alias = await request("/sign-in?provider=google", "old-app.onrender.com")
  assert.equal(alias.headers.location, "https://malikaiworld.world/sign-in?provider=google")
  assert(!alias.headers["set-cookie"]?.some((cookie) => cookie.startsWith("wos-auth-verifier")), "Never put a verifier on an alias")
  const cancelled = await request("/callback?error=access_denied")
  assert.equal(cancelled.status, 303)
  assert.equal(cancelled.headers.location, "https://malikaiworld.world/auth?error=signin_failed")
  console.log("PASS actual Next.js: canonical alias before PKCE and cancelled OAuth recovery inside Malik AI")
} finally {
  server.kill("SIGTERM")
}
