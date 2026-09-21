import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

function transpile(file) {
  return ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
}

/** The client module imports nothing, so it can be exercised on its own. */
function loadClient() {
  const box = { exports: {} }
  new Function("require", "module", "exports", transpile("lib/instagram/client.ts"))(
    (name) => { throw new Error(`unexpected require(${name})`) }, box, box.exports,
  )
  return box.exports
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${String(error.message).split("\n")[0]}`)
  }
}

const client = loadClient()
const read = (file) => fs.readFileSync(file, "utf8")

/** Comments explain why there is no password here; code is what matters. */
const code = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")

const withEnv = (env, fn) => {
  const saved = {}
  for (const [key, value] of Object.entries(env)) { saved[key] = process.env[key]; process.env[key] = value }
  try { return fn() } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
}

const GOOD = {
  INSTAGRAM_CLIENT_ID: "123",
  INSTAGRAM_CLIENT_SECRET: "secret",
  INSTAGRAM_REDIRECT_URI: "https://malikaiworld.world/api/instagram/callback",
}

console.log("\nMALIK Instagram publishing")

/* ------------------------------------------------- no passwords, ever */

check("never asks for, sends or stores an Instagram password", () => {
  for (const file of [
    "lib/instagram/client.ts",
    "lib/instagram/store.ts",
    "app/api/instagram/connect/route.ts",
    "app/api/instagram/callback/route.ts",
    "app/api/instagram/publish/route.ts",
    "app/api/instagram/route.ts",
  ]) {
    const source = code(file)
    assert.doesNotMatch(source, /\bpassword\b/i, `${file} handles a password`)
    assert.doesNotMatch(source, /puppeteer|playwright|headless/i, `${file} drives a browser instead of the API`)
  }
})

check("asks Instagram for exactly two permissions and no more", () => {
  assert.equal(client.INSTAGRAM_SCOPE, "instagram_business_basic,instagram_business_content_publish")
})

/* ------------------------------------------------------------ the OAuth */

check("builds the authorization URL Instagram actually expects", () => {
  const url = new URL(withEnv(GOOD, () => client.authorizeUrl("x".repeat(43))))
  assert.equal(url.origin + url.pathname, "https://api.instagram.com/oauth/authorize")
  assert.equal(url.searchParams.get("response_type"), "code")
  assert.equal(url.searchParams.get("client_id"), "123")
  assert.equal(url.searchParams.get("scope"), client.INSTAGRAM_SCOPE)
  assert.equal(url.searchParams.get("redirect_uri"), GOOD.INSTAGRAM_REDIRECT_URI)
  assert.equal(url.searchParams.get("state"), "x".repeat(43))
})

check("refuses a redirect Meta would reject, and says which part is wrong", () => {
  const fails = (env, pattern) => {
    assert.throws(() => withEnv({ ...GOOD, ...env }, () => client.instagramConfig()), pattern)
  }
  fails({ INSTAGRAM_REDIRECT_URI: "http://malikaiworld.world/api/instagram/callback" }, /https/)
  fails({ INSTAGRAM_REDIRECT_URI: "https://malikaiworld.world/instagram" }, /\/api\/instagram\/callback/)
  fails({ INSTAGRAM_REDIRECT_URI: "not-a-url" }, /адресом/)
  fails({ INSTAGRAM_CLIENT_SECRET: "" }, /INSTAGRAM_CLIENT_SECRET/)
})

check("reports being unconfigured instead of throwing at import time", () => {
  assert.equal(withEnv({ INSTAGRAM_CLIENT_ID: "", INSTAGRAM_CLIENT_SECRET: "" }, () => client.instagramConfigured()), false)
  assert.equal(withEnv(GOOD, () => client.instagramConfigured()), true)
})

check("derives the redirect from APP_URL when it is not set explicitly", () => {
  const config = withEnv(
    { INSTAGRAM_CLIENT_ID: "1", INSTAGRAM_CLIENT_SECRET: "2", INSTAGRAM_REDIRECT_URI: "", APP_URL: "https://malikaiworld.world/" },
    () => client.instagramConfig(),
  )
  assert.equal(config.redirectUri, "https://malikaiworld.world/api/instagram/callback")
})

/* ---------------------------------------------- the state that guards it */

check("the callback refuses a state it did not issue", () => {
  const callback = read("app/api/instagram/callback/route.ts")
  assert.match(callback, /validState\(state, expected\)/)
  assert.match(callback, /!code \|\| !state \|\| !expected/)
})

check("state comparison is constant time and shape-checked", () => {
  const store = read("lib/instagram/store.ts")
  assert.match(store, /timingSafeEqual/)
  assert.match(store, /\{43\}/, "only the exact shape nonce() produces is accepted")
})

check("a cancelled authorization is reported as cancelled, not as a failure", () => {
  assert.match(read("app/api/instagram/callback/route.ts"), /instagram: "cancelled"/)
})

/* ------------------------------------------------------ the stored token */

check("the token is encrypted and bound to the account that owns it", () => {
  const store = read("lib/instagram/store.ts")
  assert.match(store, /aes-256-gcm/)
  assert.match(store, /setAAD\(Buffer\.from\(owner\)\)/, "the owner id must be authenticated data")
  assert.match(store, /INSTAGRAM_TOKEN_ENCRYPTION_KEY/)
})

check("the short-lived token is traded up before anything is written down", () => {
  const callback = read("app/api/instagram/callback/route.ts")
  assert.ok(
    callback.indexOf("exchangeLongLived") < callback.indexOf("writeConnection"),
    "a one-hour token must never be the one that gets stored",
  )
})

check("disconnecting does not pretend to revoke access inside Instagram", () => {
  assert.match(read("app/api/instagram/route.ts"), /настройках Instagram/)
})

/* --------------------------------------------- nothing goes out unasked */

check("publishing requires an explicit confirmation in the request", () => {
  const publish = read("app/api/instagram/publish/route.ts")
  assert.match(publish, /const confirmed = body\?\.confirm === true/)
  assert.match(publish, /if \(!confirmed\) \{/)
  assert.ok(
    publish.indexOf('stage: "preview"') < publish.indexOf("createMediaContainer({"),
    "the preview must return before anything is sent to Instagram",
  )
})

check("the preview says exactly what will be posted and as whom", () => {
  const publish = read("app/api/instagram/publish/route.ts")
  for (const field of ["willPostAs", "imageUrl", "caption", "captionLength"]) {
    assert.ok(publish.includes(field), `preview is missing ${field}`)
  }
  assert.match(publish, /удалить его через API нельзя/)
})

check("a published post comes back with its permalink as the receipt", () => {
  const publish = read("app/api/instagram/publish/route.ts")
  assert.match(publish, /fetchPermalink/)
  assert.match(publish, /permalink,/)
  assert.match(publish, /stage: "published"/)
})

check("the image URL is checked here rather than left to Meta's error text", () => {
  const publish = read("app/api/instagram/publish/route.ts")
  assert.match(publish, /parsed\.protocol !== "https:"/)
  assert.match(publish, /Instagram скачивает картинку сам/)
})

check("every route requires a signed-in account", () => {
  for (const file of [
    "app/api/instagram/connect/route.ts",
    "app/api/instagram/callback/route.ts",
    "app/api/instagram/publish/route.ts",
    "app/api/instagram/route.ts",
  ]) {
    assert.match(read(file), /resolveRequestEntitlement/, `${file} is unauthenticated`)
  }
  assert.match(read("app/api/instagram/publish/route.ts"), /readJsonBodyLimited/, "the publish body must be capped")
})

/* ---------------------------------------------------- the graph contract */

check("uses api.instagram.com for OAuth and graph.instagram.com for the rest", () => {
  const source = read("lib/instagram/client.ts")
  assert.match(source, /const OAUTH_HOST = "https:\/\/api\.instagram\.com"/)
  assert.match(source, /const GRAPH_HOST = "https:\/\/graph\.instagram\.com"/)
  assert.match(source, /\/oauth\/access_token/)
  assert.match(source, /grant_type: "ig_exchange_token"|"ig_exchange_token"/)
  assert.match(source, /\/media`/)
  assert.match(source, /\/media_publish`/)
  assert.match(source, /creation_id/)
})

console.log(failures ? `\n${failures} check(s) failed\n` : "\ninstagram publishing: all checks passed\n")
process.exit(failures ? 1 : 0)
