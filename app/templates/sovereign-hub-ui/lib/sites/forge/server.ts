import { pickBlueprint } from "./blueprints"
import { forgeSite, readForgeSite, type ForgeModel, type ForgeResult } from "./index"
import type { PhotoFinder } from "./photos"

/**
 * The forge for callers outside the chat: the Sites studio and the OS
 * «site.generate» tool. Whatever text provider is configured writes the plan
 * (nothing is pinned), photographs come from the same licence-checked finder
 * the presentations use, and an earlier forge site is edited through its plan.
 *
 * The forge is built for places people visit or buy from — cafés, salons,
 * clinics, hotels, shops. A request that names none of those (a SaaS landing,
 * a product page) returns null, and the caller keeps its own engine.
 */

const SOFTWARE = /saas|приложени|платформ|software|\bapp\b|маркетплейс|marketplace|нейросет|(?<!\p{L})ии(?!\p{L})|\bai\b|стартап|startup|\bcrm\b|\bapi\b/iu

export type ServerForgeOutcome = { result: ForgeResult; provider: string; model: string; mode: "new" | "edit" }

/** Whether the forge should make this site. `strict` also leaves software products to the other engine. */
export function forgeTakes(prompt: string, options: { previousHtml?: string; strict?: boolean } = {}) {
  if (readForgeSite(options.previousHtml || "")) return true
  const blueprint = pickBlueprint(prompt)
  if (blueprint.id === "generic") return false
  if (options.strict && (blueprint.id === "studio" || SOFTWARE.test(prompt))) return false
  return true
}

export async function forgeSiteWithRouter(input: {
  prompt: string
  userId: string
  lane: string
  signal?: AbortSignal
  previousHtml?: string
  strict?: boolean
}): Promise<ServerForgeOutcome | null> {
  if (!forgeTakes(input.prompt, { previousHtml: input.previousHtml, strict: input.strict })) return null
  const previous = readForgeSite(input.previousHtml || "")
  let provider = ""
  let model = ""
  const writer: ForgeModel = async ({ system, prompt, signal }) => {
    const { routeAI } = await import("@/lib/ai/router")
    const answer = await routeAI({
      prompt,
      task: "project",
      userId: input.userId,
      userEmail: input.userId,
      maxTokens: 7000,
      temperature: 0.35,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      signal,
      metadata: { requestedKind: "website", lane: input.lane },
    })
    if (!answer?.success || typeof answer.output !== "string" || !answer.output.trim()) return null
    provider = String(answer.provider || "")
    model = String(answer.model || "")
    return answer.output
  }
  const finder: PhotoFinder = async (query, exclude) => {
    const { findPhoto } = await import("@/lib/server/presentation-photos")
    const photo = await findPhoto({ query, kind: "mood", exclude })
    return photo ? { url: photo.url, credit: photo.credit, link: photo.link } : null
  }
  const result = await forgeSite({
    prompt: input.prompt,
    model: writer,
    finder,
    signal: input.signal,
    ...(previous ? { basePlan: previous.plan, editInstruction: input.prompt } : {}),
  })
  return { result, provider: provider || "local", model: model || "Malik Site Forge", mode: previous ? "edit" : "new" }
}
