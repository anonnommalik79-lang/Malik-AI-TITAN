import { createMediaContract } from "./media-contract"

export function directImage(prompt: string) {
  const contract = createMediaContract({ prompt, aspectRatio: "1:1" })
  return {
    ...contract,
    enhancedPrompt: [
      contract.prompt,
      `Style: ${contract.style}.`,
      "Professional composition, clean subject, premium lighting, sharp detail, commercial quality.",
      `Negative: ${contract.negativePrompt}.`,
    ].join(" "),
  }
}

