import "server-only"
import type { AIResponse } from "@/lib/ai/types"
import { postProcessGeneratedImage } from "./image-postprocess"
import { withMalikImageProcessingSlot } from "./image-processing-capacity"
import { ImageWatermarkError } from "./malik-watermark"

/** Image-only delivery boundary; model selection and prompts are untouched. */
export async function finalizeImageResponse(result: AIResponse): Promise<AIResponse> {
  if (!result.success || result.type !== "image") return result
  const output = typeof result.output === "object" ? result.output : { resultUrl: result.output }
  const source = String(output.resultUrl || output.imageUrl || output.url || "")
  if (!source) throw new ImageWatermarkError()
  const image = await withMalikImageProcessingSlot(() => postProcessGeneratedImage({ imageUrl: source, quality: "draft", effect: "off" }))
  if (!image.buffer?.length || !image.watermarked) throw new ImageWatermarkError()
  const url = `data:${image.mime};base64,${image.buffer.toString("base64")}`
  const branded = { ...output, resultUrl: url, watermarked: true }
  for (const key of ["url", "imageUrl", "mediaUrl", "masterUrl", "previewUrl", "thumbnailUrl"]) {
    if (key in branded) Object.assign(branded, { [key]: url })
  }
  return { ...result, output: branded }
}
