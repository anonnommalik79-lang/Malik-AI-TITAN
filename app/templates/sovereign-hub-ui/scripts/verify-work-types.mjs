import path from "node:path"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const ts = require("typescript")
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile)
if (config.error) throw new Error("Cannot read tsconfig")
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
// Optional isolated QA packages supply actual package types, never declaration stubs.
if (process.env.MALIK_QA_DEPS) {
  const root = path.join(process.env.MALIK_QA_DEPS, "node_modules")
  parsed.options.paths = { ...parsed.options.paths, mathjs: [path.join(root, "mathjs/types/index.d.ts")], pptxgenjs: [path.join(root, "pptxgenjs/types/index.d.ts")], "pdf-lib": [path.join(root, "pdf-lib/cjs/index.d.ts")], "@pdf-lib/fontkit": [path.join(root, "@pdf-lib/fontkit/fontkit.d.ts")] }
}
parsed.options.incremental = false
const program = ts.createProgram(parsed.fileNames, parsed.options)
const errors = ts.getPreEmitDiagnostics(program)
if (errors.length) console.log(ts.formatDiagnosticsWithColorAndContext(errors, { getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: f => f, getNewLine: () => "\n" }))
console.log(`TypeScript diagnostics: ${errors.length}`)
process.exitCode = errors.length ? 1 : 0
