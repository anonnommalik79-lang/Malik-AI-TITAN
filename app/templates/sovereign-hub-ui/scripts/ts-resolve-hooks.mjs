import fs from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import path from "node:path"

const root = new URL("../", import.meta.url)
// Isolated QA can use real installed packages without changing a shared node_modules.
const qaRequire = process.env.MALIK_QA_DEPS ? createRequire(path.join(process.env.MALIK_QA_DEPS, "fixture.cjs")) : null

// A verification script can swap a server module that needs the Next.js
// runtime (auth, "server-only") for a small stand-in:
//   TS_RESOLVE_STUBS='{"@/lib/server/request-entitlement":"./scripts/stubs/entitlement.mjs"}'
const stubs = (() => {
  try { return JSON.parse(process.env.TS_RESOLVE_STUBS || "{}") } catch { return {} }
})()

export async function resolve(specifier, context, next) {
  if (stubs[specifier]) return next(new URL(stubs[specifier], root).href, context)
  // The app's "@/..." path alias points at the project root.
  if (specifier.startsWith("@/")) {
    const url = new URL(specifier.slice(2), root)
    for (const extension of ["", ".ts", ".tsx", "/index.ts"]) {
      const candidate = new URL(url.href + extension)
      if (fs.existsSync(fileURLToPath(candidate)) && fs.statSync(fileURLToPath(candidate)).isFile()) {
        return next(candidate.href, context)
      }
    }
  }
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    try {
      const url = new URL(specifier, context.parentURL)
      for (const extension of [".ts", ".tsx", "/index.ts"]) {
        const candidate = new URL(url.href + extension)
        if (fs.existsSync(fileURLToPath(candidate))) {
          return next(url.href + extension, context)
        }
      }
    } catch {}
  }
  try {
    return await next(specifier, context)
  } catch (error) {
    if (qaRequire && error?.code === "ERR_MODULE_NOT_FOUND" && /^[@a-z]/i.test(specifier) && !specifier.startsWith("@/")) {
      try { return await next(pathToFileURL(qaRequire.resolve(specifier)).href, context) } catch {}
    }
    // Packages such as "next/cache" are published without an exports map;
    // a bundler adds ".js", Node's ESM loader does not.
    if (error?.code === "ERR_MODULE_NOT_FOUND" && /^[@a-z]/i.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
      return next(`${specifier}.js`, context)
    }
    throw error
  }
}
