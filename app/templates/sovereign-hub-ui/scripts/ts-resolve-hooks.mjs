import fs from "node:fs"
import { fileURLToPath } from "node:url"

export async function resolve(specifier, context, next) {
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
  return next(specifier, context)
}
