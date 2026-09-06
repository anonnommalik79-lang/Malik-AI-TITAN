import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
const root = new URL("../", import.meta.url)
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true }
  if (specifier === "@/lib/auth/server") return { url: "data:text/javascript," + encodeURIComponent("export async function getOptionalWorkOSAuth(){return {user:globalThis.__youtubeTestUser ? {id:globalThis.__youtubeTestUser}:null}}"), shortCircuit: true }
  if (specifier === "next/server") return next("next/server.js", context)
  if (specifier.startsWith("@/") || specifier.startsWith(".")) {
    const url = specifier.startsWith("@/") ? new URL(specifier.slice(2), root) : new URL(specifier, context.parentURL)
    for (const ext of ["", ".ts", ".tsx"]) if (existsSync(fileURLToPath(url) + ext)) return next(url.href + ext, context)
  }
  return next(specifier, context)
}
