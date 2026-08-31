import { NextResponse } from "next/server"
import { runStrictMalikModel } from "@/lib/server/malik-model-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type WebsiteRequest = {
  prompt?: string
}

const WEBSITE_INSTRUCTION = `
You are Malik AI Website Builder.
Create a complete, production-quality, responsive single-page website from the user's brief.
Return ONLY one standalone HTML document. Do not wrap it in markdown fences.
Requirements:
- Start with <!doctype html> and include html, head, body.
- Put all CSS in the document and all JavaScript in the document.
- Use semantic HTML, responsive layout, accessible contrast and controls.
- Make the visual system feel premium and finished: typography, spacing, hierarchy, hover/focus states, mobile behavior.
- Honor the user's requested brand direction without copying third-party logos, copyrighted copy, or proprietary page layouts.
- Do not output explanations before or after the HTML.
`.trim()

function cleanHtml(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WebsiteRequest
    const prompt = body.prompt?.trim()

    if (!prompt) {
      return NextResponse.json({ error: "`prompt` is required" }, { status: 400 })
    }

    const result = await runStrictMalikModel({
      modelId: "malik-fast-120b",
      prompt: `USER BRIEF:\n${prompt}`,
      systemPrompt: WEBSITE_INSTRUCTION,
      maxTokens: 6000,
      temperature: 0.35,
    })

    const html = cleanHtml(result.content)

    if (!html || !/<html[\s>]/i.test(html)) {
      return NextResponse.json(
        { error: "Website generator returned invalid HTML" },
        { status: 502 },
      )
    }

    return NextResponse.json({
      html,
      content: html,
      provider: result.provider,
      model: result.model,
      selectedModelId: result.selectedModelId,
      latencyMs: result.latencyMs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Website generation failed" },
      { status: 500 },
    )
  }
}
