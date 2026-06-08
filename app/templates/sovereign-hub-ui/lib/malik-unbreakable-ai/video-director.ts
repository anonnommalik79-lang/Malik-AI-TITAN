import { createMediaContract } from "./media-contract"

export function directVideo(prompt: string) {
  const contract = createMediaContract({ prompt, aspectRatio: "16:9", duration: 5 })
  return {
    ...contract,
    enhancedPrompt: [
      contract.prompt,
      `Style: ${contract.style}.`,
      `Aspect ratio: ${contract.aspectRatio}. Duration: ${contract.duration}s.`,
      "Smooth camera movement, strong subject continuity, cinematic lighting, stable motion, clear final frame.",
      `Negative: ${contract.negativePrompt}.`,
    ].join(" "),
    shots: ["opening hook", "main action", "final cinematic frame"],
  }
}

