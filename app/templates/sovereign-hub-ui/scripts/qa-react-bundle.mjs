// Tiny QA-only bundle of real React components, without installing a bundler.
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url), ts = require("typescript")
export function reactQaBundle() {
  const modules = {}
  for (const [name, file] of [["react", "react.production.js"], ["react/jsx-runtime", "react-jsx-runtime.production.js"], ["scheduler", "scheduler.production.js"], ["react-dom", "react-dom.production.js"], ["react-dom/client", "react-dom-client.production.js"]]) modules[name] = fs.readFileSync(path.join(path.dirname(require.resolve(name)), "cjs", file), "utf8")
  modules["lucide-react"] = fs.readFileSync(require.resolve("lucide-react"), "utf8")
  function bundle(file) {
    if (modules[file]) return file
    modules[file] = ""
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    modules[file] = js.replace(/require\("([^"]+)"\)/g, (whole, name) => {
      if (name.endsWith(".css") || modules[name]) return whole
      const base = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name)
      const target = [base, base + ".ts", base + ".tsx"].find(f => fs.existsSync(f))
      if (!target) throw Error(`QA import missing: ${name}`)
      return `require(${JSON.stringify(bundle(target))})`
    }); return file
  }
  return { modules, bundle }
}
export function reactQaRuntime(modules) {
  return `const process={env:{NODE_ENV:'production'}},sources=${JSON.stringify(modules)},cache={};function require(id){if(id.endsWith('.css'))return {};if(cache[id])return cache[id].exports;if(!sources[id])throw Error('Missing QA module '+id);const module=cache[id]={exports:{}};new Function('module','exports','require','process',sources[id])(module,module.exports,require,process);return module.exports}const React=require('react');`
}
