import type { Diagnostic, GeneratedFile } from "./types"

export function reviewGeneratedFiles(files: GeneratedFile[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const file of files) {
    if (!file.content.trim()) {
      diagnostics.push({ level: "error", code: "EMPTY_FILE", message: `${file.path} is empty.` })
    }
    if (/api[_-]?key|secret|password|token\s*=/i.test(file.content)) {
      diagnostics.push({ level: "warning", code: "POSSIBLE_SECRET", message: `${file.path} may contain secret-like text.` })
    }
    if (file.content.length > 220_000) {
      diagnostics.push({ level: "warning", code: "LARGE_FILE", message: `${file.path} is very large.` })
    }
  }

  if (!files.length) diagnostics.push({ level: "error", code: "NO_FILES", message: "No generated files." })
  return diagnostics
}

