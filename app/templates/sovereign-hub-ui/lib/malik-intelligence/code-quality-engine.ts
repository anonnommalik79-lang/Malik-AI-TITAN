import type { GeneratedFile } from "./types"
import { resolveLanguage } from "./language-codex"

export function buildCodeArchitectPrompt(prompt: string, languageInput = "typescript", framework = "") {
  const language = resolveLanguage(languageInput)
  return [
    "[MALIK_CODE_ARCHITECT_FINAL]",
    `Target language: ${language.title}`,
    `Family: ${language.family}`,
    framework ? `Framework: ${framework}` : "",
    "Write production-ready code, not toy snippets.",
    "Return files with paths.",
    "Include state, validation, error handling and clean architecture.",
    "Do not expose API keys or secrets.",
    "If target language is rare/custom, state compiler/runtime assumptions clearly.",
    "For frontend: responsive, accessible, loading/empty/error/success states.",
    "For backend: validate input, handle timeouts, no secret logging.",
    `User task: ${prompt}`,
  ].filter(Boolean).join("\n")
}

export function localCodeFallback(prompt: string, languageInput = "typescript", framework = ""): GeneratedFile[] {
  const language = resolveLanguage(languageInput)
  const header = `${language.comment} MALIK AI production fallback\n${language.comment} Task: ${prompt}\n${language.comment} Language: ${language.title}\n\n`

  return [
    {
      path: language.defaultFile,
      language: language.id,
      content: header + fallbackBody(language.id, framework),
      purpose: "Safe local starter file generated when the engine output is unavailable.",
    },
    {
      path: "README.generated.md",
      language: "markdown",
      content: `# MALIK AI Generated Code Plan\n\nTask: ${prompt}\n\nLanguage: ${language.title}\nFramework: ${framework || "none"}\n\nRun: ${language.runHint}\n`,
      purpose: "Human-readable generation notes.",
    },
  ]
}

function fallbackBody(languageId: string, framework: string) {
  if (languageId === "react" || framework === "react") {
    return `export default function MalikGeneratedComponent() {\n  return <main className="min-h-screen bg-black text-white p-8">MALIK AI generated component</main>\n}\n`
  }
  if (languageId === "python") return `def main():\n    print("MALIK AI generated Python starter")\n\nif __name__ == "__main__":\n    main()\n`
  if (languageId === "javascript" || languageId === "typescript") return `export function run() {\n  return "MALIK AI generated starter"\n}\n`
  return `MALIK AI generated starter for ${languageId}.\n`
}

