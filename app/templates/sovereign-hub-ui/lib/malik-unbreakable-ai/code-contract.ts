export type CodeContract = {
  prompt: string
  language: string
  framework?: string
  mode: "component" | "app" | "api" | "debug" | "full-project"
  quality: string[]
}

export function createCodeContract(input: Partial<CodeContract> & { prompt: string }): CodeContract {
  return {
    prompt: input.prompt,
    language: input.language || "typescript",
    framework: input.framework,
    mode: input.mode || "component",
    quality: input.quality || ["typed", "safe", "responsive", "loading/error/success", "no secrets"],
  }
}

