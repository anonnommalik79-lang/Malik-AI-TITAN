import { decideSuperflow, detectCapabilities } from "@/lib/os/capabilities"
import type { Capability } from "@/lib/os/types"
import type { WorkspaceMode } from "@/lib/ai/work-mode"

const imperative = /(?<![\p{L}\p{N}])(?:создай(?:те)?|сделай(?:те)?|подготовь(?:те)?|разработай(?:те)?|построй(?:те)?|собери(?:те)?|напиши(?:те)?|оформи(?:те)?|сгенерируй(?:те)?|экспортируй(?:те)?|create|build|make|prepare|develop|draft|write|generate|export)(?![\p{L}\p{N}])/iu
const question = /^(?:что|как|почему|зачем|когда|где|кто|сколько|какой|какая|какие|можно ли|what|how|why|when|where|who|is|are|can)(?![\p{L}\p{N}])|\?\s*$/iu
const fileResult = /документ|отч[её]т|презентац|слайд|сайт|лендинг|бизнес[- ]?план|document|report|presentation|deck|website|landing|business\s+plan|(?<![\p{L}\p{N}])(?:docx|pdf|xlsx|pptx|zip)(?![\p{L}\p{N}])/iu
const code = /(?<![\p{L}\p{N}])(?:код|code|python|javascript|typescript|html|css|sql|react)(?![\p{L}\p{N}])|функци[юя]|function|алгоритм/iu
const codePackage = /проект|репозитор|project|repository|(?<![\p{L}\p{N}])zip(?![\p{L}\p{N}])/iu

/** Work extends auto-routing; chat's existing decision stays unchanged. */
export function routeWorkRequest(goal: string, options: { mode: WorkspaceMode; signedIn: boolean; attachmentKinds?: string[] }): { route: "chat" | "flow"; reason: string; capabilities: Capability[] } {
  const text = String(goal || "").trim()
  const legacy = decideSuperflow(text, options.attachmentKinds || [])
  const chat = (reason: string) => ({ route: "chat" as const, reason, capabilities: legacy.capabilities })
  if (!options.signedIn) return chat("guest")
  if (options.mode !== "work") return { route: legacy.run ? "flow" : "chat", reason: legacy.reason, capabilities: legacy.capabilities }
  if (/^\s*\//.test(text)) return chat("command")
  if (code.test(text) && !codePackage.test(text)) return chat("inline-code")
  if (legacy.run) return { route: "flow", reason: legacy.reason, capabilities: legacy.capabilities }
  if (question.test(text)) return chat("question")
  if (!imperative.test(text) || !fileResult.test(text)) return chat("no-file-instruction")
  const capabilities = detectCapabilities(text, options.attachmentKinds || [])
  if (/\bpptx\b/iu.test(text) && !capabilities.includes("presentation")) capabilities.push("presentation")
  if (/\bzip\b/iu.test(text) && codePackage.test(text) && !capabilities.includes("code")) capabilities.push("code")
  if (!capabilities.length) capabilities.push("document")
  return { route: "flow", reason: "work-file-result", capabilities }
}
