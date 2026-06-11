import { compileGodVideoPrompt, type VideoAspectRatio } from "./god-prompt-compiler"

type StartResult = {
  ok: boolean
  status: "queued" | "rendering" | "ready" | "failed"
  provider: string
  providerTitle: string
  engine: string
  jobId?: string
  statusUrl?: string
  url?: string
  videoUrl?: string
  message?: string
  publicError?: string
  compiledPrompt?: string
  debug?: Record<string, unknown>
}

function env(name: string) {
  return process.env[name]?.trim() || ""
}

function awsRegion() {
  return env("AWS_REGION") || env("AWS_DEFAULT_REGION") || "us-east-1"
}

function videoModelId() {
  return env("AWS_BEDROCK_VIDEO_MODEL") || env("AWS_NOVA_REEL_MODEL") || "amazon.nova-reel-v1:0"
}

function videoS3Uri() {
  return env("AWS_BEDROCK_VIDEO_S3_URI") || env("AWS_NOVA_REEL_S3_URI") || env("AWS_VIDEO_S3_URI") || ""
}

export function isAwsNovaConfigured() {
  return Boolean(env("AWS_ACCESS_KEY_ID") && env("AWS_SECRET_ACCESS_KEY") && videoS3Uri())
}

function s3FromUri(uri: string) {
  const clean = uri.replace(/^s3:\/\//i, "")
  const slash = clean.indexOf("/")
  if (slash < 0) return { bucket: clean, prefix: "" }
  return { bucket: clean.slice(0, slash), prefix: clean.slice(slash + 1).replace(/^\/+/, "") }
}

async function sdk() {
  const bedrock = await import("@aws-sdk/client-bedrock-runtime")
  const s3 = await import("@aws-sdk/client-s3")
  const presigner = await import("@aws-sdk/s3-request-presigner")
  return { bedrock, s3, presigner }
}

export async function startAwsNovaReelVideo(input: {
  prompt: string
  durationSeconds?: number
  aspectRatio?: VideoAspectRatio
}): Promise<StartResult> {
  const provider = "aws-bedrock-nova-reel"
  const providerTitle = "AWS Bedrock Nova Reel"
  const engine = "MALIK V5 Legacy Video Engine + God Prompt Compiler"

  if (!isAwsNovaConfigured()) {
    return {
      ok: false,
      status: "failed",
      provider,
      providerTitle,
      engine,
      publicError: "AWS Nova Reel is not configured. Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION and AWS_BEDROCK_VIDEO_S3_URI.",
      message: "Missing AWS Bedrock/S3 environment variables.",
    }
  }

  const compiled = compileGodVideoPrompt({
    prompt: input.prompt,
    durationSeconds: input.durationSeconds || 5,
    aspectRatio: input.aspectRatio || "16:9",
  })

  const { bedrock } = await sdk()
  const client = new bedrock.BedrockRuntimeClient({ region: awsRegion() })
  const s3Uri = videoS3Uri()

  const modelInput = {
    taskType: "TEXT_VIDEO",
    textToVideoParams: {
      text: compiled.providerPrompt,
    },
    videoGenerationConfig: {
      durationSeconds: compiled.durationSeconds,
      fps: 24,
      dimension: compiled.aspectRatio === "9:16" ? "720x1280" : "1280x720",
      seed: Math.floor(Math.random() * 2147483647),
    },
  }

  const command = new bedrock.StartAsyncInvokeCommand({
    modelId: videoModelId(),
    modelInput,
    outputDataConfig: {
      s3OutputDataConfig: {
        s3Uri,
      },
    },
  })

  const response = await client.send(command)
  const jobId = String(response.invocationArn || "")

  if (!jobId) {
    return {
      ok: false,
      status: "failed",
      provider,
      providerTitle,
      engine,
      publicError: "AWS Bedrock did not return invocationArn.",
      message: "Nova Reel job could not be started.",
      compiledPrompt: compiled.providerPrompt,
      debug: response as Record<string, unknown>,
    }
  }

  return {
    ok: true,
    status: "queued",
    provider,
    providerTitle,
    engine,
    jobId,
    statusUrl: `/api/generate/video/status?provider=aws-bedrock-nova-reel&jobId=${encodeURIComponent(jobId)}`,
    message: "Nova Reel video job queued.",
    compiledPrompt: compiled.providerPrompt,
  }
}

export async function pollAwsNovaReelVideo(jobId: string): Promise<StartResult> {
  const provider = "aws-bedrock-nova-reel"
  const providerTitle = "AWS Bedrock Nova Reel"
  const engine = "MALIK V5 Legacy Video Engine + God Prompt Compiler"

  if (!jobId) {
    return { ok: false, status: "failed", provider, providerTitle, engine, publicError: "Missing jobId." }
  }

  const { bedrock, s3, presigner } = await sdk()
  const region = awsRegion()
  const bedrockClient = new bedrock.BedrockRuntimeClient({ region })
  const s3Client = new s3.S3Client({ region })

  const response = await bedrockClient.send(new bedrock.GetAsyncInvokeCommand({ invocationArn: jobId }))
  const status = String(response.status || "").toLowerCase()

  if (status.includes("failed")) {
    return {
      ok: false,
      status: "failed",
      provider,
      providerTitle,
      engine,
      publicError: String((response as any).failureMessage || "AWS Nova Reel generation failed."),
      debug: response as Record<string, unknown>,
    }
  }

  if (!status.includes("completed")) {
    return {
      ok: true,
      status: "rendering",
      provider,
      providerTitle,
      engine,
      jobId,
      statusUrl: `/api/generate/video/status?provider=aws-bedrock-nova-reel&jobId=${encodeURIComponent(jobId)}`,
      message: `Nova Reel status: ${response.status || "InProgress"}`,
    }
  }

  const s3Uri =
    ((response as any).outputDataConfig?.s3OutputDataConfig?.s3Uri as string | undefined) ||
    videoS3Uri()

  const { bucket, prefix } = s3FromUri(s3Uri)
  const listed = await s3Client.send(new s3.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
  const object = (listed.Contents || [])
    .filter((item: any) => item.Key && /\.(mp4|mov|webm)$/i.test(item.Key))
    .sort((a: any, b: any) => Number(b.LastModified || 0) - Number(a.LastModified || 0))[0]

  if (!object?.Key) {
    return {
      ok: false,
      status: "failed",
      provider,
      providerTitle,
      engine,
      publicError: "Nova Reel completed, but no MP4 file was found in S3 output.",
      debug: { s3Uri, listedCount: listed.Contents?.length || 0 },
    }
  }

  const signedUrl = await presigner.getSignedUrl(
    s3Client,
    new s3.GetObjectCommand({ Bucket: bucket, Key: object.Key }),
    { expiresIn: 60 * 60 }
  )

  return {
    ok: true,
    status: "ready",
    provider,
    providerTitle,
    engine,
    jobId,
    url: signedUrl,
    videoUrl: signedUrl,
    message: "Nova Reel video ready.",
  }
}
