import { SKILL_REGISTRY } from "@/lib/skills/registry"
import { skillStore } from "@/lib/skills/store"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { executorConfiguration } from "@/lib/website/engine/executor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const owner = await resolveRequestEntitlement(request)
  return Response.json({ version: "malik-skills/1", skills: Object.values(SKILL_REGISTRY),
    execution: { signedIn: owner.authenticated, durableCheckpoints: skillStore().durable, nodeTestWorker: Boolean(executorConfiguration()), npmBuildWorker: false,
      modelAvailability: "checked-on-execution", entrypoint: "/api/stream", commands: ["/forge", "/research", "/team", "/verify"] } }, { headers: { "cache-control": "private, no-store" } })
}
