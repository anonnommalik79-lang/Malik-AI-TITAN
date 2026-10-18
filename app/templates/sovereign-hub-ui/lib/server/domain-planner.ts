import "server-only"
import { applySemanticDomainPlan, DOMAIN_SEMANTIC_INSTRUCTION, type DomainPlan } from "@/lib/ai/domain-intelligence"

export type DomainClassifier = (input: { prompt: string; systemPrompt: string; signal: AbortSignal }) => Promise<{ content: string }>

/** One optional planning call. No loop/cache/shared user data. Race the budget
 * even when a broken provider ignores abort, and always clean up listeners. */
export async function refineDomainPlan(base: DomainPlan, classify: DomainClassifier, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<DomainPlan> {
  if (!base.semantic.needed) return base
  options.signal?.throwIfAborted()
  const controller = new AbortController()
  const aborted = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener("abort", aborted, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    const timeout = new Promise<null>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null) }, Math.max(1, Math.min(3000, options.timeoutMs ?? 1800)))
      onAbort = () => resolve(null)
      controller.signal.addEventListener("abort", onAbort, { once: true })
    })
    const result = await Promise.race([classify({ prompt: JSON.stringify({ latest: base.request.slice(0, 6000), context: base.context.anchor.slice(0, 1800), currentPlan: { goal: base.goal, domains: base.domains, delivery: base.delivery } }), systemPrompt: DOMAIN_SEMANTIC_INSTRUCTION, signal: controller.signal }), timeout])
    options.signal?.throwIfAborted()
    return result ? applySemanticDomainPlan(base, result.content) : base
  } catch {
    options.signal?.throwIfAborted()
    return base
  } finally {
    clearTimeout(timer)
    if (onAbort) controller.signal.removeEventListener("abort", onAbort)
    options.signal?.removeEventListener("abort", aborted)
    controller.abort()
  }
}
