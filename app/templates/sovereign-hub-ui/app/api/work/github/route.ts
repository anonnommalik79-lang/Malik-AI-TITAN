import { z } from "zod"
import { osOwner } from "@/lib/os/http"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { readGitHub, previewGitHub, executeGitHub, githubReadSchema, githubWriteSchema, WorkGitHubError } from "@/lib/work/github"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120
const schema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("read"), payload: githubReadSchema }).strict(),
  z.object({ phase: z.literal("preview"), payload: githubWriteSchema }).strict(),
  z.object({ phase: z.literal("execute"), payload: githubWriteSchema, confirmationId: z.string().max(100), idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/) }).strict(),
])
export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" }
  try {
    const owner = await osOwner(request)
    if (!owner.authenticated) return Response.json({ error: "Войдите в аккаунт, чтобы работать со своим GitHub." }, { status: 401, headers })
    if (!takeRequestFrequency("work-github", owner.userId, 20)) return Response.json({ error: "Слишком много операций. Попробуйте через минуту." }, { status: 429, headers })
    const parsed = schema.safeParse(await readJsonBodyLimited<unknown>(request, 160 * 1024))
    if (!parsed.success) return Response.json({ error: "Проверьте репозиторий, параметры и подтверждение операции." }, { status: 400, headers })
    const input = parsed.data
    const result = input.phase === "read" ? await readGitHub(owner.userId, input.payload) : input.phase === "preview" ? await previewGitHub(owner.userId, input.payload) : await executeGitHub(owner.userId, input.payload, input.confirmationId, input.idempotencyKey)
    return Response.json({ ok: true, result }, { headers })
  } catch (error) {
    return Response.json({ error: error instanceof WorkGitHubError ? error.message : error instanceof RequestSafetyError ? "Запрос слишком большой или содержит неверный JSON." : "Операция GitHub не выполнена. Проверьте подключение и параметры.", code: error instanceof WorkGitHubError ? error.code : "INVALID_REQUEST" }, { status: error instanceof WorkGitHubError || error instanceof RequestSafetyError ? error.status : 400, headers })
  }
}
