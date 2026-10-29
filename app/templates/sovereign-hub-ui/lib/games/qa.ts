import ts from "typescript"
import type { GameCheck } from "./types"

/**
 * Checks on the model's game.js before anything runs it:
 *   syntax   — the TypeScript compiler's own JavaScript parser;
 *   policy   — the code is a game, not a way out: no network, storage, DOM,
 *              timers, code generation or prototype tricks (an AST walk, not
 *              a text search, so comments and strings do not trip it);
 *   contract — MalikGame.define({ ... update, draw ... }) is really there.
 * Every finding names a line, so it can be sent back to the model to fix.
 */

export type StaticReport = { syntax: GameCheck; policy: GameCheck; contract: GameCheck; problems: string[] }

/** Never allowed, whatever the code declares: these are the ways out of a sandbox. */
const ALWAYS = new Set(["eval", "Function", "globalThis", "process", "require", "module", "exports", "Reflect", "Proxy", "WebAssembly", "importScripts", "SharedArrayBuffer", "Atomics"])
/** Browser globals a game must not reach; a variable of the same name declared in the file is fine. */
const GLOBALS = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker", "localStorage", "sessionStorage", "indexedDB", "caches", "document", "window", "self", "parent", "top", "opener", "frames", "location", "navigator", "setTimeout", "setInterval", "requestAnimationFrame", "cancelAnimationFrame", "queueMicrotask", "postMessage", "alert", "confirm", "prompt", "Image", "Audio", "open", "close", "history", "cookieStore"])
/** Property names used to climb out of an object into its realm. */
const MEMBERS = new Set(["constructor", "__proto__", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "getPrototypeOf", "setPrototypeOf", "caller", "callee"])

function lineOf(source: ts.SourceFile, position: number) {
  return source.getLineAndCharacterOfPosition(position).line + 1
}

export function checkSyntax(code: string): GameCheck {
  const output = ts.transpileModule(code, {
    fileName: "game.js",
    reportDiagnostics: true,
    compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None, noEmit: false },
  })
  const details = (output.diagnostics || [])
    .filter((item) => item.category === ts.DiagnosticCategory.Error)
    .slice(0, 8)
    .map((item) => {
      const text = ts.flattenDiagnosticMessageText(item.messageText, " ")
      const line = item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : 0
      return line ? `game.js:${line} syntax error: ${text}` : `syntax error: ${text}`
    })
  return { status: details.length ? "fail" : "pass", details }
}

function declaredNames(source: ts.SourceFile) {
  const names = new Set<string>()
  const add = (name: ts.BindingName | ts.Identifier | undefined) => {
    if (!name) return
    if (ts.isIdentifier(name)) names.add(name.text)
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) name.elements.forEach((element) => { if (ts.isBindingElement(element)) add(element.name) })
  }
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) add(node.name)
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) add(node.name)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

/** Is this identifier a reference to a variable (not a property name, key or label)? */
function isReference(node: ts.Identifier) {
  const parent = node.parent
  if (!parent) return true
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent) || ts.isPropertySignature(parent)) && parent.name === node) return false
  if ((ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node) return false
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false
  return true
}

export function checkPolicy(code: string): GameCheck {
  const source = ts.createSourceFile("game.js", code, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  const declared = declaredNames(source)
  const found = new Map<string, number>()
  const flag = (label: string, node: ts.Node) => { if (!found.has(label)) found.set(label, lineOf(source, node.getStart(source))) }
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && isReference(node)) {
      const name = node.text
      if (ALWAYS.has(name)) flag(name, node)
      else if (GLOBALS.has(name) && !declared.has(name)) flag(name, node)
    }
    if (ts.isPropertyAccessExpression(node) && MEMBERS.has(node.name.text)) flag(`.${node.name.text}`, node.name)
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && MEMBERS.has(node.argumentExpression.text)) flag(`["${node.argumentExpression.text}"]`, node)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) flag("import()", node)
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node)) flag("import/export", node)
    if (node.kind === ts.SyntaxKind.WithStatement) flag("with", node)
    if (node.kind === ts.SyntaxKind.DebuggerStatement) flag("debugger", node)
    if ((ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) && /(?:https?:)?\/\/[a-z0-9-]+\.[a-z]/iu.test(node.getText(source))) flag("external URL", node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  // A line that starts with a code fence would end the chat's code block early.
  const fence = code.split("\n").findIndex((line) => /^\s*(?:```|~~~)/u.test(line))
  if (fence >= 0) found.set("a line starting with ``` (Markdown fence)", fence + 1)
  const details = [...found.entries()].slice(0, 10).map(([label, line]) => `game.js:${line} not allowed in a Malik game: ${label}`)
  return { status: details.length ? "fail" : "pass", details }
}

export function checkContract(code: string, engine: "2d" | "3d" = "2d"): GameCheck {
  const source = ts.createSourceFile("game.js", code, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS)
  let calls = 0
  let names: Set<string> | null = null
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "MalikGame" && node.expression.name.text === "define") {
      calls += 1
      const argument = node.arguments[0]
      if (argument && ts.isObjectLiteralExpression(argument)) {
        names = new Set(argument.properties.map((property) => { const key = property.name; return key && (ts.isIdentifier(key) || ts.isStringLiteral(key)) ? key.text : "" }).filter(Boolean))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  const details: string[] = []
  if (!calls) details.push(engine === "3d" ? "MalikGame.define({ setup, start, update }) is never called" : "MalikGame.define({ setup, start, update, draw }) is never called")
  if (calls > 1) details.push("MalikGame.define is called more than once; call it exactly once")
  const defined = names as Set<string> | null
  // A 3D game builds its world in start() and three.js renders it: no draw().
  if (defined) for (const required of engine === "3d" ? ["start", "update"] : ["update", "draw"]) if (!defined.has(required)) details.push(`MalikGame.define is missing ${required}(...)`)
  if (!defined && calls === 1 && !/\bupdate\b/u.test(code)) details.push("the game object has no update(dt, api)")
  if (code.length < 1500) details.push("game.js is too short to be a complete game")
  return { status: details.length ? "fail" : "pass", details }
}

export function staticGameReport(code: string, engine: "2d" | "3d" = "2d"): StaticReport {
  const syntax = checkSyntax(code)
  // A file that does not parse cannot be judged further; the parser's errors come first.
  const policy = syntax.status === "pass" ? checkPolicy(code) : { status: "not_run" as const, details: [] }
  const contract = syntax.status === "pass" ? checkContract(code, engine) : { status: "not_run" as const, details: [] }
  return { syntax, policy, contract, problems: [...syntax.details, ...policy.details, ...contract.details] }
}
