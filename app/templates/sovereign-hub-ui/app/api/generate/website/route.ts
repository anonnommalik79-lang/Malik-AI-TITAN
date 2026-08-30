import { NextResponse } from "next/server"
import { ProviderRequestError } from "@/lib/ai/provider-registry"
import { getMalikAIProviderRegistry } from "@/lib/ai/server"

export const runtime = "nodejs"

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

    const registry = getMalikAIProviderRegistry()
    const result = await registry.generate({
      mode: "code",
      prompt: `${WEBSITE_INSTRUCTION}\n\nUSER BRIEF:\n${prompt}`,
      stream: false,
    })

    const html = cleanHtml(result.content)

    if (!html) {
      return NextResponse.json(
        { error: "Website generator returned empty HTML" },
        { status: 502 },
      )
    }

    return NextResponse.json({
      html,
      content: html,
      requestId: result.requestId,
      provider: result.provider,
      latencyMs: result.latencyMs,
      qualityScore: result.qualityScore,
      attempts: result.attempts,
    })
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(
        { error: error.message, provider: error.provider, status: error.status },
        { status: error.status },
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Website generation failed" },
      { status: 500 },
    )
  }
}
