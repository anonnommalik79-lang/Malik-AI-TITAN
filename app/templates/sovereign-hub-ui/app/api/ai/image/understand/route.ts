import { buildVisualPrompt } from "@/lib/media/visual-prompt"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * "What Malik understood", answered before the picture is made.
 *
 * The chat card shows this line while the generation animation runs, so a
 * heavy accent, a typo or a Kazakh phrase produces something the user can read
 * and correct in a second — instead of a wrong photograph forty seconds later.
 *
 * The description this returns is handed back to /api/ai/image, which reuses it
 * rather than understanding the same sentence twice.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const prompt = String(body?.prompt || body?.message || "").slice(0, 900)

  if (prompt.trim().length < 2) {
    return Response.json(
      { ok: false, error: "PROMPT_REQUIRED", message: "Напишите, что нарисовать." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  try {
    const visual = await buildVisualPrompt(prompt)
    if (!visual.prompt) {
      return Response.json(
        { ok: false, error: "EMPTY_VISUAL_REQUEST", message: "Не удалось разобрать запрос. Опишите картинку словами." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    return Response.json(
      {
        ok: true,
        understood: visual.understood,
        source: visual.source,
        translated: visual.translated,
        model: visual.model,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    // Understanding is a convenience. The generation route can still do it.
    return Response.json(
      { ok: false, error: "UNDERSTAND_FAILED", message: "Не удалось разобрать запрос." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    )
  }
}
