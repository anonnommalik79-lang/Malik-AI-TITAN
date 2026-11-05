import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { getSkillRun, skillRunView } from "@/lib/skills/orchestrator"
import { skillStore } from "@/lib/skills/store"
import { SkillError } from "@/lib/skills/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "cache-control": "private, no-store" }
  try {
    const owner = await resolveRequestEntitlement(request)
    if (!owner.authenticated) return Response.json({ error: "SIGN_IN_REQUIRED" }, { status: 401, headers })
    const run = await getSkillRun(skillStore(), owner.userId, (await context.params).id)
    return Response.json({ ok: true, run: skillRunView(run) }, { headers })
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof SkillError ? error.code : "SKILL_STORAGE_UNAVAILABLE" }, { status: error instanceof SkillError ? error.status : 503, headers })
  }
}
