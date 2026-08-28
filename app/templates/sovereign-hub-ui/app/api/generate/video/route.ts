import { NextRequest, NextResponse } from "next/server"
import { compileGodVideoPrompt } from "@/lib/ai/video/god-prompt-compiler"
import { startAwsNovaReelVideo } from "@/lib/ai/video/aws-nova-reel"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

function parseDuration(value: unknown) {
  const n = Number(value || 5)
  if (!Number.isFinite(n)) return 5
  return Math.max(3, Math.min(n, 12))
}

export const POST = withCompute(handlePOST, "video")

async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const prompt = String(body.prompt || body.message || body.input || "").trim()
  const durationSeconds = parseDuration(body.durationSeconds || body.duration || 5)
  const aspectRatio = String(body.aspectRatio || body.format || "16:9")

  if (!prompt) {
    return json({ ok: false, status: "failed", message: "Prompt is required." }, 400)
  }

  const compiled = compileGodVideoPrompt({ prompt, durationSeconds, aspectRatio })

  try {
    const result = await startAwsNovaReelVideo({
      prompt,
      durationSeconds,
      aspectRatio,
    })

    if (result.ok) {
      return json({
        ...result,
        model: "amazon.nova-reel-v1:0",
        title: compiled.title,
        prompt,
        enhancedPrompt: compiled.englishPrompt,
        negativePrompt: compiled.negativePrompt,
      })
    }

    return json({
      ok: false,
      status: "failed",
      provider: "aws-bedrock-nova-reel",
      providerTitle: "AWS Bedrock Nova Reel",
      engine: "MALIK V5 Legacy Video Engine + God Prompt Compiler",
      code: "aws_video_not_configured_or_failed",
      prompt,
      title: compiled.title,
      enhancedPrompt: compiled.englishPrompt,
      negativePrompt: compiled.negativePrompt,
      message: result.publicError || result.message || "Real video provider did not return a video URL.",
      publicError: result.publicError || result.message,
      fallbackMode: "cinema-preview",
      text: [
        "Cinema Preview ready.",
        "Real video needs working AWS Bedrock Nova Reel credentials and S3 output.",
        "The prompt was compiled correctly and is ready for real generation.",
        "",
        compiled.providerPrompt,
      ].join("\n"),
    }, 200)
  } catch (error: any) {
    return json({
      ok: false,
      status: "failed",
      provider: "aws-bedrock-nova-reel",
      providerTitle: "AWS Bedrock Nova Reel",
      engine: "MALIK V5 Legacy Video Engine + God Prompt Compiler",
      code: "aws_nova_reel_exception",
      prompt,
      title: compiled.title,
      enhancedPrompt: compiled.englishPrompt,
      negativePrompt: compiled.negativePrompt,
      message: error?.message || "AWS Nova Reel failed.",
      publicError: error?.message || "AWS Nova Reel failed.",
      fallbackMode: "cinema-preview",
      text: [
        "Cinema Preview ready.",
        "AWS Nova Reel failed before returning a video URL.",
        "",
        compiled.providerPrompt,
      ].join("\n"),
    }, 200)
  }
}
