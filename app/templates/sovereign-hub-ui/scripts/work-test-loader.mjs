import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const ts = require("typescript")
/** Tests execute real TypeScript; only explicitly listed server boundaries are stubbed. */
export function workTestLoader(stubs = {}) {
  const cache = new Map()
  const qaRequire = process.env.MALIK_QA_DEPS ? createRequire(path.join(process.env.MALIK_QA_DEPS, "fixture.cjs")) : null
  function load(file) {
    const full = path.resolve(file)
    if (cache.has(full)) return cache.get(full).exports
    const mod = { exports: {} }; cache.set(full, mod)
    const js = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const resolve = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name]
      if (name === "server-only") return {}
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(full), name)
        for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) if (fs.existsSync(base + suffix) && fs.statSync(base + suffix).isFile()) return load(base + suffix)
      }
      try { return require(name) } catch (error) { if (qaRequire && error.code === "MODULE_NOT_FOUND") return qaRequire(name); throw error }
    }
    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: full })(resolve, mod, mod.exports)
    return mod.exports
  }
  return load
}
