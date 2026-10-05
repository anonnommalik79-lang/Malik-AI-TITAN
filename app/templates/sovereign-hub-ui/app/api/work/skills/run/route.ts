import { z } from "zod"
import { osOwner } from "@/lib/os/http"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { mathTaskSchema } from "@/lib/work/math/schema"
import { runMath } from "@/lib/work/math/engine"
import { DOCUMENT_FORMATS } from "@/lib/work/documents/formats"
import { exportDocument } from "@/lib/work/documents/export"
import { documentResponse } from "@/lib/work/documents/http"
import { recordWorkActivity } from "@/lib/work/activity-log"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const inputSchema = z.discriminatedUnion("skill", [
  z.object({ skill: z.literal("math.compute"), task: mathTaskSchema }).strict(),
  z.object({ skill: z.literal("document.export"), format: z.enum(DOCUMENT_FORMATS), title: z.string().min(1).max(160), markdown: z.string().min(1).max(200000) }).strict(),
])
export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" }, started = Date.now()
  let ownerId = "", skill = ""
  try {
    const owner = await osOwner(request); ownerId = owner.userId
    if (!takeRequestFrequency("work-skill-run", ownerId, owner.authenticated ? 12 : 6)) return Response.json({ error: "Слишком много запусков. Попробуйте через минуту." }, { status: 429, headers })
    const parsed = inputSchema.safeParse(await readJsonBodyLimited<unknown>(request, 240 * 1024))
    if (!parsed.success) return Response.json({ error: "Запуск доступен только для движков math.compute и document.export. Проверьте параметры." }, { status: 400, headers })
    const input = parsed.data; skill = input.skill
    if (input.skill === "math.compute") {
      const result = runMath(input.task)
      await recordWorkActivity(ownerId, { action: skill, ok: result.ok, durationMs: Date.now() - started, code: result.ok ? undefined : result.code })
      return Response.json({ ok: result.ok, result }, { status: result.ok ? 200 : 422, headers })
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const output = await Promise.race([exportDocument(input), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("TIMEOUT")), 20000) })]).finally(() => clearTimeout(timer))
    await recordWorkActivity(ownerId, { action: skill, ok: true, durationMs: Date.now() - started })
    return documentResponse(output)
  } catch (error) {
    if (ownerId && skill) await recordWorkActivity(ownerId, { action: skill, ok: false, durationMs: Date.now() - started, code: error instanceof RequestSafetyError ? error.code : "ENGINE_FAILED" }).catch(() => undefined)
    return Response.json({ error: error instanceof RequestSafetyError && error.status === 413 ? "Запрос слишком большой." : "Движок не смог выполнить запрос. Проверьте исходные данные." }, { status: error instanceof RequestSafetyError ? error.status : 422, headers })
  }
}
