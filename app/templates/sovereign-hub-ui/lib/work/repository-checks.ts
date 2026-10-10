import ts from "typescript"

export type RepositoryCheck = { path: string; check: "syntax" | "json"; ok: boolean; errors: string[] }
export function checkRepositoryFiles(files: Array<{ path: string; content: string }>): { checks: RepositoryCheck[]; notRun: string[] } {
  const checks: RepositoryCheck[] = [], notRun: string[] = []
  for (const file of files) {
    if (/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(file.path)) {
      // Parse/transpile only. Never execute user/model code or load its dependencies on the host.
      // Declaration files must be parsed as TS, not emitted as declarations (which can throw).
      const result = ts.transpileModule(file.content, { fileName: file.path.replace(/\.d\.(ts|mts|cts)$/i, ".$1"), reportDiagnostics: true, compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve,
      } })
      const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error)
        .map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      checks.push({ path: file.path, check: "syntax", ok: !errors.length, errors })
    } else if (/\.json$/i.test(file.path)) {
      try { JSON.parse(file.content); checks.push({ path: file.path, check: "json", ok: true, errors: [] }) }
      catch { checks.push({ path: file.path, check: "json", ok: false, errors: ["Invalid JSON"] }) }
    } else notRun.push(file.path)
  }
  return { checks, notRun }
}

export function repositoryFileAllowed(path: string) {
  return path.length <= 240 && !path.startsWith("/") && !/[\\:\p{Cc}]/u.test(path)
    && !path.split("/").some(part => !part || part === "." || part === ".." || /^(?:\.git|node_modules|\.ssh|\.aws|\.azure|\.gcloud|\.docker)$/i.test(part))
    && !/(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519|service-account(?:\.[^/]*)?|credentials(?:\.[^/]*)?|secrets?(?:\.[^/]*)?)$/i.test(path)
    && !/\.(?:pem|key|p12|pfx|keystore)$/i.test(path)
}
