import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

const file = new URL("../.env.local", import.meta.url)
let source = ""
try {
  source = await readFile(file, "utf8")
} catch {}

const lines = source
  .split(/\r?\n/)
  .filter(Boolean)

function findIndex(name) {
  return lines.findIndex((line) => line.startsWith(`${name}=`))
}

function ensure(name, value) {
  const index = findIndex(name)
  if (index === -1) lines.push(`${name}=${value}`)
  else if (name.includes("REDIRECT_URI")) lines[index] = `${name}=${value}`
}

ensure("WORKOS_CLIENT_ID", "")
ensure("WORKOS_API_KEY", "")

const cookieIndex = findIndex("WORKOS_COOKIE_PASSWORD")
const cookieValue = cookieIndex >= 0 ? lines[cookieIndex].slice("WORKOS_COOKIE_PASSWORD=".length).trim() : ""
if (cookieValue.length < 32) {
  const generated = randomBytes(32).toString("base64url")
  if (cookieIndex >= 0) lines[cookieIndex] = `WORKOS_COOKIE_PASSWORD=${generated}`
  else lines.push(`WORKOS_COOKIE_PASSWORD=${generated}`)
}

const redirectUri = process.env.NODE_ENV === "production"
  ? "https://malikaiworld.world/callback"
  : "http://localhost:3000/callback"

ensure("WORKOS_REDIRECT_URI", redirectUri)
ensure("NEXT_PUBLIC_WORKOS_REDIRECT_URI", redirectUri)

await writeFile(file, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8")
console.log("WorkOS env keys ensured; production callback is pinned to malikaiworld.world; secret values were not printed.")
