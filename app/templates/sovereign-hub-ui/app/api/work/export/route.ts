import { z } from "zod"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { takeRequestFrequency } from "@/lib/server/request-frequency"
import { exportDocument } from "@/lib/work/documents/export"
import { DOCUMENT_FORMATS } from "@/lib/work/documents/formats"
import { documentResponse } from "@/lib/work/documents/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const inputSchema = z.object({ format: z.enum(DOCUMENT_FORMATS), title: z.string().trim().min(1).max(160), markdown: z.string().min(1).max(400000) }).strict()
export async function POST(request: Request) {
  try {
    const owner = await resolveRequestEntitlement(request)
    if (!takeRequestFrequency("work-export", owner.userId, owner.authenticated ? 12 : 6)) return Response.json({ error: "Слишком много скачиваний. Попробуйте через минуту." }, { status: 429, headers: { "retry-after": "60", "cache-control": "private, no-store" } })
    const input = inputSchema.safeParse(await readJsonBodyLimited(request, 400 * 1024))
    if (!input.success) return Response.json({ error: "Проверьте формат, название и текст документа." }, { status: 400 })
    return documentResponse(await exportDocument(input.data))
  } catch (error) {
    return Response.json({ error: error instanceof RequestSafetyError ? "Запрос слишком большой или содержит неверный JSON." : error instanceof Error && /таблиц|страниц|Заголовок таблицы/.test(error.message) ? error.message : "Не удалось создать файл. Попробуйте ещё раз." }, { status: error instanceof RequestSafetyError ? error.status : 422, headers: { "cache-control": "private, no-store" } })
  }
}
