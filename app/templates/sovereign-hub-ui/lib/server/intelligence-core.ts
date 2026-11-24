import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import { conversationHistory, conversationHistorySource } from "@/lib/ai/conversation-history"
import { resolveConversationIntent } from "@/lib/ai/conversation-intent"
import { resolveDomainPlan, type DomainPlan } from "@/lib/ai/domain-intelligence"
import { conversationFocus, type ConversationFocus } from "@/lib/ai/conversation-focus"
import { classifyFreshness, requireEvidence, NO_WEB } from "@/lib/ai/freshness-intent"
import { shouldUseWeb, type WebSearchOptions } from "@/lib/ai/web-search-policy"
import { refineDomainPlan, type DomainClassifier } from "./domain-planner"

type TurnBody = { history?: unknown; messages?: unknown; attachments?: unknown; metadata?: { timeZone?: unknown } } & WebSearchOptions
type Identity = { prompt: string; history: unknown; attachments: unknown; timeZone: unknown }
type Turn = ReturnType<typeof buildTurn>
type Scope = { now: Date; entries: Array<{ key: Identity; turn: Turn }> }
const scope = new AsyncLocalStorage<Scope>()

/** Request-owned plan; never stored in a global cache or accepted from the client. */
export function withIntelligenceTurnScope<T>(run: () => T): T {
  return scope.run({ now: new Date(), entries: [] }, run)
}

function focusFor(prompt: string, history: ReturnType<typeof conversationHistory>, domain: DomainPlan): ConversationFocus {
  return domain.context.followUp ? conversationFocus(prompt, history)
    : { followUp: false, anchor: "", searchText: prompt, shapeText: prompt }
}

function buildTurn(prompt: string, body: TurnBody, now: Date) {
  const rawHistory = conversationHistorySource(body)
  const history = conversationHistory(body)
  const intent = resolveConversationIntent({ prompt, messages: rawHistory, attachments: body.attachments })
  const domain = resolveDomainPlan({ prompt, messages: rawHistory, attachments: body.attachments, intent })
  const focus = focusFor(prompt, history, domain)
  const timeZone = body.metadata?.timeZone
  const requestFreshness = classifyFreshness(prompt, now, timeZone)
  const freshness = requireEvidence(classifyFreshness(focus.searchText, now, timeZone),
    domain.evidence.safetySensitive && domain.evidence.web === "required")
  return { prompt, history, intent, domain, focus, now, timeZone, requestFreshness, freshness,
    holdForEvidence: freshness.needsSearch || domain.evidence.web === "required" }
}

const EMPTY_HISTORY: unknown[] = []
export function resolveIntelligenceTurn(prompt: string, body: TurnBody): Turn {
  const active = scope.getStore()
  const history = conversationHistorySource(body)
  const key = { prompt, history: history.length ? history : EMPTY_HISTORY, attachments: body.attachments, timeZone: body.metadata?.timeZone }
  const found = active?.entries.find(e => e.key.prompt === key.prompt && e.key.history === key.history
    && e.key.attachments === key.attachments && e.key.timeZone === key.timeZone)
  if (found) return found.turn
  const turn = buildTurn(prompt, body, active?.now || new Date())
  if (active && active.entries.length < 8) active.entries.push({ key, turn })
  return turn
}

/** The same authorized read-only tool decision serves JSON, streaming and rescue.
 * A model can request evidence, but never override an explicit opt-out. */
export function intelligenceWebDecision(turn: Pick<Turn, "domain" | "focus">, body: WebSearchOptions, force = false): boolean {
  if (turn.domain.evidence.web === "off" || body.disableResearch || NO_WEB.test(turn.focus.searchText)) return false
  return shouldUseWeb(turn.focus.searchText, body, turn.domain) || (force && body.research !== false)
}

export async function refineIntelligenceTurn(turn: Turn, classify: DomainClassifier, options: { signal?: AbortSignal; timeoutMs?: number } = {}) {
  const domain = await refineDomainPlan(turn.domain, classify, options)
  if (domain === turn.domain) return turn
  const focus = focusFor(turn.prompt, turn.history, domain)
  const freshness = requireEvidence(classifyFreshness(focus.searchText, turn.now, turn.timeZone),
    domain.evidence.safetySensitive && domain.evidence.web === "required")
  return { ...turn, domain, focus, freshness,
    holdForEvidence: freshness.needsSearch || domain.evidence.web === "required" }
}
