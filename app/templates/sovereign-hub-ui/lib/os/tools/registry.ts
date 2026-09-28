import type { ToolName } from "../types"
import type { ToolDefinition } from "./contract"
import { dataTool } from "./data-tool"
import { editTool } from "./edit-tool"
import { codeTool, imageTool, presentationTool, siteTool } from "./media-tools"
import { assembleTool, brandTool, businessLaunchTool, businessPlanTool, documentTool, researchTool, understandTool, videoScriptTool } from "./text-tools"

/** Every action a flow may take. Nothing outside this list can be run. */
export const TOOLS: Record<ToolName, ToolDefinition> = {
  "goal.understand": understandTool,
  "research.web": researchTool,
  "brand.create": brandTool,
  "image.generate": imageTool,
  "site.generate": siteTool,
  "presentation.generate": presentationTool,
  "document.write": documentTool,
  "business.plan": businessPlanTool,
  "business.launch": businessLaunchTool,
  "video.script": videoScriptTool,
  "code.project": codeTool,
  "data.analyze": dataTool,
  "artifact.edit": editTool,
  "result.assemble": assembleTool,
}

export function toolFor(name: string): ToolDefinition | null {
  return Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name as ToolName] : null
}

/** What the interface may show about the tools: no internals. */
export function toolCatalog() {
  return Object.values(TOOLS).map((tool) => ({ name: tool.name, label: tool.label, sideEffect: tool.sideEffect, timeoutMs: tool.timeoutMs }))
}
