import { getMalikModel } from "@/lib/ai/malik-models"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"
import { isSameMalikOrigin } from "@/lib/server/uber-rides"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TAXI_MODEL_ID = "malik-27b" as const

function cleanText(value: unknown, max = 240) {
  return String(value ?? "")
    .replace(/^\s*["'`]+|["'`]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

export async function POST(request: Request) {
  if (!isSameMalikOrigin(request)) {
    return Response.json({ ok: false, code: "INVALID_ORIGIN", message: "Invalid request origin." }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const prompt = cleanText(body?.prompt, 400)
  if (prompt.length < 2) {
    return Response.json({ ok: false, code: "DESTINATION_REQUIRED", message: "Укажи, куда хочешь поехать." }, { status: 400 })
  }

  const model = getMalikModel(TAXI_MODEL_ID)

  try {
    const result = await runStrictMalikModel({
      modelId: TAXI_MODEL_ID,
      prompt,
      systemPrompt: [
        "Ты Malik Taxi Route Parser.",
        "Из пользовательского сообщения выдели только пункт назначения, который можно передать геокодеру.",
        "Не придумывай город, улицу, номер дома или другие детали, которых пользователь не называл.",
        "Если пользователь уже дал адрес или название места, сохрани его максимально близко к исходному.",
        "Удали только разговорные слова вроде 'отвези меня', 'хочу поехать', 'поехали в'.",
        "Верни только одну короткую строку с пунктом назначения. Без JSON, объяснений, кавычек и комментариев.",
      ].join(" "),
      maxTokens: 80,
      temperature: 0.05,
    })

    const destination = cleanText(result.content, 180) || prompt.slice(0, 180)
    return Response.json({
      ok: true,
      destination,
      fallback: false,
      model: {
        id: model.id,
        label: model.label,
        description: model.description,
      },
      provider: result.provider,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.warn("[MALIK_TAXI_AGENT] falling back to raw destination", error)
    return Response.json({
      ok: true,
      destination: prompt.slice(0, 180),
      fallback: true,
      model: {
        id: model.id,
        label: model.label,
        description: model.description,
      },
    }, { headers: { "Cache-Control": "no-store" } })
  }
}
