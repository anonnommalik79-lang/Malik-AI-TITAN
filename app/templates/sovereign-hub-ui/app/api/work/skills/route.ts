import { osOwner } from "@/lib/os/http"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { workSkillCatalog } from "@/lib/work/skills/registry"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const headers = { "cache-control": "private, no-store" }
  try {
    const owner = await osOwner(request)
    if (!takeRequestFrequency("work-skills", owner.userId, 30)) return Response.json({ error: "Слишком много запросов. Попробуйте через минуту." }, { status: 429, headers })
    return Response.json({ ok: true, skills: await workSkillCatalog(owner) }, { headers })
  } catch { return Response.json({ error: "Не удалось проверить доступность навыков." }, { status: 503, headers }) }
}
