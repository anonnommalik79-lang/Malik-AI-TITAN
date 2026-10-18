import type { ConversationIntent, OutputFormat } from "./conversation-intent"
import { actionableRequest } from "./artifact-intent"

export type ExecutionContract = {
  version: 1
  kind: "CONVERSATION" | "SPREADSHEET" | "PRESENTATION" | "DOCUMENT" | "WEBSITE" | "CODE" | "GENERATE_IMAGE" | "EDIT_IMAGE" | "GENERATE_VIDEO" | "ATTACHMENT_ANALYSIS" | "EXISTING_ARTIFACT_EDIT" | "MULTI_TOOL"
  primaryOutput: { type: ConversationIntent["target"]; format?: OutputFormat }
  outputs: Array<{ type: ConversationIntent["target"]; format?: OutputFormat }>
  steps: Array<{ id: string; tool: string; dependsOn: string[]; availability: "unchecked" }>
  constraints: { formulas: boolean; charts: boolean; slideCount?: number; months?: number }
  sourceArtifactId?: string
}

/** An execution contract extends the existing intent, not a second model router.
 * Availability/receipts are supplied by real tools, never guessed by a model. */
export function executionContract(intent: ConversationIntent, attachments: unknown = []): ExecutionContract {
  const text = actionableRequest(intent.original), count = Array.isArray(attachments) ? attachments.length : 0
  const isEdit = intent.followUp && /(?:измени|исправ|поменяй|замени|change|edit|fix)/iu.test(text)
  const analysis = intent.target === "text" && count > 0
  const primaryOutput = { type: intent.target, ...(intent.requirements.format && intent.target === "document" ? { format: intent.requirements.format } : {}) }
  const outputs: ExecutionContract["outputs"] = [primaryOutput]
  const steps: ExecutionContract["steps"] = []
  const add = (tool: string, dependsOn: string[] = []) => { const id = `step-${steps.length + 1}`; steps.push({ id, tool, dependsOn, availability: "unchecked" }); return id }
  const auxImage = intent.target !== "image" && intent.target !== "text" && /(?:сген\p{L}*|нарисуй|generate|draw)\s+(?:нов\p{L}*\s+|an?\s+)?(?:изображени\p{L}*|картинк\p{L}*|фото|image|picture)/iu.test(text)
  let dependency: string[] = []
  if (count) dependency = [add("attachment.analyze")]
  if (auxImage) dependency = [add("image.generate", dependency)]
  const tools = { text: "conversation.reply", document: "document.export", website: "site.generate", code: "code.project", image: count ? "image.edit" : "image.generate", video: "video.generate" }
  const main = add(tools[intent.target], dependency)
  if (intent.target === "website" && intent.requirements.format && /(?:затем|потом|после|также|и\s+(?:сделай|создай|выдай)|then|after|also)/iu.test(text)) {
    outputs.push({ type: "document", format: intent.requirements.format }); add("document.export", [main])
  }
  const slides = /(?:(\d{1,2})\s*(?:слайд\p{L}*|slides?)|(?:на\s+)?(\d{1,2})[- ]слайд\p{L}*)/iu.exec(text)
  const months = /(\d{1,3})\s*(?:месяц\p{L}*|months?)/iu.exec(text)
  const kind: ExecutionContract["kind"] = outputs.length > 1 || auxImage ? "MULTI_TOOL" : isEdit ? "EXISTING_ARTIFACT_EDIT"
    : analysis ? "ATTACHMENT_ANALYSIS" : intent.target === "document" ? intent.requirements.format === "xlsx" ? "SPREADSHEET" : intent.requirements.format === "pptx" ? "PRESENTATION" : "DOCUMENT"
    : intent.target === "website" ? "WEBSITE" : intent.target === "code" ? "CODE" : intent.target === "image" ? count ? "EDIT_IMAGE" : "GENERATE_IMAGE" : intent.target === "video" ? "GENERATE_VIDEO" : "CONVERSATION"
  return { version: 1, kind, primaryOutput, outputs, steps, constraints: { formulas: intent.requirements.formulas === true, charts: /(?:график|диаграмм|charts?|graphs?)/iu.test(text) && !/(?:без|no|without)\s+(?:график|диаграмм|charts?|graphs?)/iu.test(text), ...(slides ? { slideCount: Number(slides[1] || slides[2]) } : {}), ...(months ? { months: Number(months[1]) } : {}) }, ...(intent.source?.artifactId ? { sourceArtifactId: intent.source.artifactId } : {}) }
}
