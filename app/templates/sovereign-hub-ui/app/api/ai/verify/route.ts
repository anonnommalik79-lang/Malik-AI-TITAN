import { auditAnswerFacts, recheckFigure } from "@/lib/ai/fact-audit"
import { gatherSourcesForPrompt } from "@/lib/malik-god-router"
import { readJsonBodyLimited, RequestSafetyError } from "@/lib/server/request-safety"
import { resolveRequestEntitlement } from "@/lib/server/request-entitlement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 256 * 1024
const MAX_ANSWER_CHARS = 24_000
const MAX_CLAIM_CHARS = 400
const MAX_QUESTION_CHARS = 1_000

/**
 * Verification on demand — the half of the fact audit that the reader starts.
 *
 * The audit that runs with every answer can only compare it against the pages
 * that were already open. Two things fall outside that, and both are what a
 * reader actually wants:
 *
 *  - a figure the answer stated that those pages did not contain. The first
 *    verdict only says it was absent from pages fetched for the whole
 *    question. This route fetches pages for that figure specifically, which
 *    either finds it — and the flag was a false alarm worth clearing — or
 *    fails to, which is a far stronger result than the first pass.
 *  - an answer written with no web search at all. Most answers are. Until now
 *    those carried no verdict, so an unchecked figure looked exactly like a
 *    checked one. This route runs the whole audit over them on request.
 *
 * It costs a search, which is why it runs when somebody asks for it rather
 * than on every answer, and why it is behind the same entitlement as the chat.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBodyLimited(request, MAX_BODY_BYTES)
    const entitlement = await resolveRequestEntitlement(request)
    if (!entitlement.authenticated) {
      return Response.json(
        { ok: false, error: "Проверка по источникам доступна после входа в аккаунт." },
        { status: 401, headers: { "cache-control": "no-store" } },
      )
    }

    const question = String((body as any)?.question || "").trim().slice(0, MAX_QUESTION_CHARS)
    const answer = String((body as any)?.answer || "").trim().slice(0, MAX_ANSWER_CHARS)
    const claim = String((body as any)?.claim || "").trim().slice(0, MAX_CLAIM_CHARS)
    const sentence = String((body as any)?.sentence || "").trim().slice(0, MAX_CLAIM_CHARS)

    if (!claim && !answer) {
      return Response.json(
        { ok: false, error: "Нечего проверять: нужен ответ или конкретное число." },
        { status: 400, headers: { "cache-control": "no-store" } },
      )
    }

    // Searching for the claim on its own returns the dictionary; searching for
    // it inside the sentence it came from returns the fact. The question is
    // kept in front so the query stays on the subject the reader asked about.
    const query = claim
      ? [question, sentence || claim].filter(Boolean).join(" · ").slice(0, 320)
      : question || answer.slice(0, 320)

    const sources = await gatherSourcesForPrompt(query)

    if (claim) {
      const result = recheckFigure({ claim, sources, prompt: question })
      if (!result) {
        return Response.json(
          { ok: false, error: "В этом утверждении нет числа, которое можно сверить." },
          { status: 400, headers: { "cache-control": "no-store" } },
        )
      }
      return Response.json(
        { ok: true, kind: "claim", ...result, sources },
        { headers: { "cache-control": "no-store", "x-malik-router": "fact-audit-recheck" } },
      )
    }

    return Response.json(
      { ok: true, kind: "answer", audit: auditAnswerFacts({ answer, sources, prompt: question }), sources },
      { headers: { "cache-control": "no-store", "x-malik-router": "fact-audit-recheck" } },
    )
  } catch (error) {
    if (error instanceof RequestSafetyError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } })
    }
    console.warn("[MALIK_FACT_VERIFY]", error instanceof Error ? error.message : String(error))
    return Response.json(
      { ok: false, error: "Не удалось проверить по источникам. Попробуйте ещё раз." },
      { status: 503, headers: { "cache-control": "no-store" } },
    )
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    route: "/api/ai/verify",
    purpose: "Re-check one figure, or a whole answer, against pages fetched on demand.",
  })
}
