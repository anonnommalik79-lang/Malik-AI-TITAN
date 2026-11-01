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
  if (classifyFreshness(prompt).needsSearch && /(?:сегодня|сейчас|актуальн|новост|последн|найди|поищ|источник|интернет|latest|current|today|live|breaking|browse|search the web)/iu.test(prompt)) return false

  const profile = analyzeMalikBrainV1({
    prompt,
    historyLength: Array.isArray(body.history) ? body.history.length : 0,
    requestedDepth: body.responseDepth || body.metadata?.responseDepth,
  })
  if (["casual", "image", "video", "vision", "voice"].includes(profile.task)) return false
  if (profile.depth === "instant") return false
  const explicit = /(?:нескольк\p{L}*\s+агент\p{L}*|параллельн\p{L}*\s+(?:ветк\p{L}*|агент\p{L}*)|multi[- ]agent|subagents?|parallel agents|несколько независимых анализов)/iu.test(prompt)
  const sufficientBudget = !Number.isFinite(Number(body.maxTokens)) || Number(body.maxTokens) >= 1200
  return sufficientBudget && (explicit || (profile.depth === "deep" || profile.depth === "ultra") && profile.complexityScore >= 5)
}

export type GeneratedMission = {
  kind: "analysis" | "research" | "code" | "website" | "project"
  title: string
  detail: string
}

const ACTION_INTENT = /(?:закаж\p{L}*|оплат\p{L}*|покуп\p{L}*|отправ\p{L}*|опублику\p{L}*|удал\p{L}*|заброниру\p{L}*|соверш\p{L}*\s+перевод|purchase|send\s|publish|delete|book\s|deploy\s|execute\s+shell)/iu

/** A provider returns proposals, never authorization for actions. Invalid
 * plans cause direct answering instead of substituting hardcoded missions. */
export function parseAutonomousMissionPlan(raw: string): GeneratedMission[] {
  if (typeof raw !== "string" || raw.length > 7000) return []
  const clean = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gu, "")
  let parsed: any
  try { parsed = JSON.parse(clean) } catch { return [] }
  if (!parsed || !Array.isArray(parsed.missions)) return []
  if (parsed.missions.length < 2 || parsed.missions.length > 3) return []
  const result: GeneratedMission[] = []
  const names = new Set<string>()
  for (const item of parsed.missions) {
    if (!item || !["analysis", "research", "code", "website", "project"].includes(item.kind) ||
      typeof item.title !== "string" || typeof item.detail !== "string") return []
    const title = item.title.trim()
    const detail = item.detail.trim()
    const key = title.toLocaleLowerCase()
    if (title.length < 8 || title.length > 130 || detail.length < 16 || detail.length > 600 ||
      names.has(key) || ACTION_INTENT.test(title + " " + detail)) return []
    names.add(key)
    result.push({ kind: item.kind, title, detail })
  }
  return result.slice(0, 2)
}
