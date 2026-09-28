import type { VideoGenerateInput } from "../types"

export function buildRunwayVideoEditBody(
  input: VideoGenerateInput,
  model: "aleph2" | "gemini_omni_flash" | "gemini_omni_flash_1.1" | "seedance2_5",
  length: number,
): Record<string, unknown> {
  if (!input.sourceVideoUrl) throw new Error("Runway video source is required")
  if (input.editOperation === "extend" && model !== "seedance2_5") {
    throw new Error("Video extension requires Runway Seedance 2.5")
  }
  if (model === "seedance2_5") {
    return {
      model,
      promptVideo: input.sourceVideoUrl,
      promptText: input.prompt,
      mode: input.editOperation === "extend" ? "extend" : "edit",
      duration: input.editOperation === "extend" ? length : "auto",
      audio: input.generateAudio !== false,
    }
  }
  if (model === "gemini_omni_flash_1.1") {
    return { model, videoUri: input.sourceVideoUrl, promptText: input.prompt, mode: "edit", duration: "auto" }
  }
  return { model, videoUri: input.sourceVideoUrl, promptText: input.prompt }
}
