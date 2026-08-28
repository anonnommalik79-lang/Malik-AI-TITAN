import { NextRequest, NextResponse } from "next/server"
import { pollAwsNovaReelVideo } from "@/lib/ai/video/aws-nova-reel"

import { withComputeVideoStatus } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const GET = withComputeVideoStatus(handleGET)

async function handleGET(req: NextRequest) {
  const url = new URL(req.url)
  const jobId = url.searchParams.get("jobId") || url.searchParams.get("invocationArn") || ""

  if (!jobId) {
    return NextResponse.json({ ok: false, status: "failed", message: "Missing jobId." }, { status: 400 })
  }

  try {
    const result = await pollAwsNovaReelVideo(jobId)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      status: "failed",
      provider: "aws-bedrock-nova-reel",
      providerTitle: "AWS Bedrock Nova Reel",
      code: "aws_nova_reel_status_exception",
      message: error?.message || "Failed to poll AWS Nova Reel.",
      publicError: error?.message || "Failed to poll AWS Nova Reel.",
    }, { status: 200 })
  }
}
