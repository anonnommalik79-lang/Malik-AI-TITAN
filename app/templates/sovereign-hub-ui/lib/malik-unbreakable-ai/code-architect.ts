import { createCodeContract } from "./code-contract"
import { codeMatrixTarget, supportsCustomLanguage } from "./code-matrix"

export function architectCode(prompt: string, language = "typescript", framework = "") {
  const target = codeMatrixTarget(language)
  const support = supportsCustomLanguage(target)
  const contract = createCodeContract({ prompt, language: target, framework })
  return {
    contract,
    support,
    systemPrompt: [
      "You are MALIK AI Unbreakable Code Architect.",
      `Language: ${target}. Framework: ${framework || "none"}.`,
      `Mode: ${contract.mode}.`,
      "Return files with paths. Write production-level code. Include edge cases.",
      "Never expose secrets. Prefer safe defaults. Explain assumptions for rare languages.",
      `User task: ${prompt}`,
    ].join("\n"),
  }
}

