import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const savedEnvironment = { NODE_ENV: process.env.NODE_ENV, RENDER: process.env.RENDER }
process.env.NODE_ENV = "production"
process.env.RENDER = "true"
let configured = true, sdkCalls = [], verifiers = []
const mocks = {
  "@/lib/auth/server": { isWorkOSConfigured: () => configured },
  "next/navigation": { redirect(location) { throw Object.assign(new Error("test-redirect"), { location }) } },
  "@workos-inc/authkit-nextjs": { async getSignInUrl(options) {
    sdkCalls.push(options)
    verifiers.push("fixture-pkce-cookie")
    return "https://api.workos.com/user_management/authorize?provider=authkit&screen_hint=sign-in&client_id=client_fixture&state=fixture-sealed-state&code_challenge=fixture-challenge&code_challenge_method=S256&redirect_uri=" + encodeURIComponent(options.redirectUri)
  } },
}
const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }
  cache.set(file, module)
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", code)((id) => {
    if (id in mocks) return mocks[id]
    const target = id.startsWith("@/") ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file), id)
    return load(target + ".ts")
  }, module, module.exports)
  return module.exports
}

try {
  const { GET } = load("app/sign-in/route.ts")
  const { canonicalSignInRedirect } = load("lib/auth/canonical-sign-in.ts")
  async function destination(url, headers = {}) {
    try { await GET(new Request(url, { headers })); assert.fail("Sign-in must redirect") }
    catch (error) { if (!error.location) throw error; return new URL(error.location) }
  }
  for (const [requested, provider] of [["google", "GoogleOAuth"], ["apple", "AppleOAuth"], ["microsoft", "MicrosoftOAuth"], ["email", "authkit"]]) {
    for (const headers of [
      { host: "malikaiworld.world", "x-forwarded-proto": "https" },
      { host: "malikaiworld.world", "x-forwarded-proto": "http" },
      { host: "localhost:10000", "x-forwarded-host": "malikaiworld.world", "x-forwarded-proto": "https" },
      { host: "127.0.0.1:10000", "x-forwarded-host": "malikaiworld.world, internal.proxy" },
      { host: "MALIKAIWORLD.WORLD:443" },
    ]) {
      sdkCalls = []; verifiers = []
      const target = await destination(`http://localhost:10000/sign-in?provider=${requested}`, headers)
      assert.equal(target.origin, "https://api.workos.com", "Render's internal URL must never cause a redirect back to sign-in")
      assert.equal(target.searchParams.get("provider"), provider)
      assert.equal(target.searchParams.get("redirect_uri"), "https://malikaiworld.world/callback")
      assert.equal(target.searchParams.get("state"), "fixture-sealed-state")
      assert.equal(target.searchParams.get("code_challenge"), "fixture-challenge")
      assert.equal(target.searchParams.get("code_challenge_method"), "S256")
      assert.equal(sdkCalls.length, 1)
      assert.equal(verifiers.length, 1, "Exactly one host-bound verifier is created")
    }
  }
  for (const host of ["www.malikaiworld.world", "old-app.onrender.com", "malikaiworld.world.evil.example", "malikaiworld.world@evil.example", "malikaiworld.world/evil"]) {
    sdkCalls = []; verifiers = []
    const target = await destination("http://localhost:10000/sign-in?provider=apple&returnTo=%2Fshorts", { host, "x-forwarded-host": "malikaiworld.world" })
    assert.equal(target.origin, "https://malikaiworld.world", "Alias normalization always uses the fixed public domain")
    assert.equal(target.pathname, "/sign-in")
    assert.equal(target.searchParams.get("provider"), "apple")
    assert.equal(target.searchParams.get("returnTo"), "/shorts")
    assert.equal(sdkCalls.length, 0, "Alias must canonicalize before setting PKCE cookies")
    assert.equal(verifiers.length, 0)
    const second = await destination(target.href, { host: "malikaiworld.world" })
    assert.equal(second.origin, "https://api.workos.com", "A canonical host change takes exactly one hop")
  }
  assert.equal(canonicalSignInRedirect(new Request("https://malikaiworld.world/sign-in")), null)
  sdkCalls = []
  const externalReturn = await destination("https://malikaiworld.world/sign-in?returnTo=https%3A%2F%2Fevil.example")
  assert.equal(externalReturn.origin, "https://api.workos.com")
  assert.equal(sdkCalls[0].returnTo, "/dashboard")
  configured = false; sdkCalls = []
  const disconnected = await destination("http://localhost:10000/sign-in?provider=google", { host: "malikaiworld.world" })
  assert.equal(disconnected.href, "https://malikaiworld.world/auth?error=workos_not_configured")
  assert.equal(sdkCalls.length, 0)
  console.log("PASS auth redirects: all four providers behind Render, canonical aliases in one hop, PKCE preservation, no open redirects and unconfigured recovery")
} finally {
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
