import type { GeneratedFile } from "./types"
import { checksum } from "./id"

export function assembleCodeBundle(files: GeneratedFile[]) {
  const totalChars = files.reduce((sum, file) => sum + file.content.length, 0)
  const fingerprint = checksum(files.map((file) => `${file.path}:${file.content}`).join("\n---\n"))

  return {
    files,
    totalFiles: files.length,
    totalChars,
    fingerprint,
    ready: files.length > 0,
  }
}

export function filesToMarkdown(files: GeneratedFile[]) {
  return files
    .map((file) => `### ${file.path}\n\n\`\`\`${file.language}\n${file.content}\n\`\`\``)
    .join("\n\n")
}

