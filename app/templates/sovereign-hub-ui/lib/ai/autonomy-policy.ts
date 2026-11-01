import { analyzeMalikBrainV1 } from "./brain-v1"
import { resolveConversationIntent } from "./conversation-intent"
import { classifyFreshness } from "./freshness-intent"

/**
 * Eligibility, not a list of hard-coded subagent assignments.
 * The model writes a fresh task decomposition after this gate. Ordinary chats
 * and tool-backed work continue through their existing specialized paths.
 */
export function shouldAutonomouslyDecompose(body: Record<string, any>): boolean {
  if (process.env.MALIK_AUTONOMY_AUTO === "false") return false
  if (!body || body.chatRecovery || body.forceCanvas || body.isProjectRequest ||
    body.actionPlan || body.toolCalls || body.superflow || body.isToolRequest ||
    body.workspaceMode === "work" || body.metadata?.autonomyDisabled === true) return false
  if (Array.isArray(body.attachments) && body.attachments.length) return false
  const prompt = String(body.originalQuestion || body.prompt || body.question || "").trim()
  if (prompt.length < 60 || prompt.length > 6000 || /^\s*\//u.test(prompt)) return false

  const delivery = resolveConversationIntent({ prompt }).target
  // Never intercept media generation, document export, browser or site building.
  if (delivery !== "text" && delivery !== "code") return false
  // Fresh facts need real search evidence from the main research lane, not
  // speculative unaided subagents that may look like verified research.
  if (classifyFreshness(prompt).needsSearch) return false

  const profile = analyzeMalikBrainV1({
    prompt,
    historyLength: Array.isArray(body.history) ? body.history.length : 0,
    requestedDepth: body.responseDepth || body.metadata?.responseDepth,
  })
  if (["casual", "image", "video", "vision", "voice"].includes(profile.task)) return false
  if (profile.depth === "instant") return false
  const explicit = /(?:нескольк\p{L}*\s+агент\p{L}*|параллельн\p{L}*\s+(?:ветк\p{L}*|агент\p{L}*)|multi[- ]agent|subagents?|parallel agents|несколько независимых анализов)/iu.test(prompt)
  const sufficientBudget = !Number.isFinite(Number(body.maxTokens)) || Number(body.maxTokens) >= 1200
  return sufficientBudget && (explicit || (profile.depth === "deep" || profile.depth === "ultra") && profile.complexityScore >= 6)
}
