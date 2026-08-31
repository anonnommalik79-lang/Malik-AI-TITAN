import { compileGodVideoPrompt, type VideoAspectRatio, type CompiledVideoPrompt } from "./god-prompt-compiler"
import { ensure8KQualityPrompt } from "@/lib/media/visual-prompt"

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

const PROVIDER = "aws-bedrock-nova-reel"
const PROVIDER_TITLE = "AWS Bedrock Nova Reel"
const ENGINE = "MALIK V5 Legacy Video Engine + God Prompt Compiler"
const NOVA_REEL_DURATION_SECONDS = 6
const NOVA_REEL_PROMPT_LIMIT = 480

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

function awsCredentials(): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } {
  const accessKeyId = env("AWS_ACCESS_KEY_ID")
  const secretAccessKey = env("AWS_SECRET_ACCESS_KEY")
  const sessionToken = env("AWS_SESSION_TOKEN")

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY")
  }

  return sessionToken ? { accessKeyId, secretAccessKey, sessionToken } : { accessKeyId, secretAccessKey }
}

function validateS3Uri(uri: string) {
  if (!uri) throw new Error("Missing AWS_BEDROCK_VIDEO_S3_URI or AWS_NOVA_REEL_S3_URI")
  if (!uri.startsWith("s3://")) throw new Error("AWS_BEDROCK_VIDEO_S3_URI must start with s3://")
  return uri
}

export function isAwsNovaConfigured() {
  return Boolean(env("AWS_ACCESS_KEY_ID") && env("AWS_SECRET_ACCESS_KEY") && videoS3Uri().startsWith("s3://"))
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function clampText(value: string, maxLength: number) {
  const normalized = oneLine(value)
  if (normalized.length <= maxLength) return normalized
  return normalized.slice(0, Math.max(0, maxLength - 1)).replace(/[\s,.;:-]+$/g, "").trim()
}

function buildNovaReelPrompt(compiled: CompiledVideoPrompt) {
  const subject = clampText(compiled.subject || compiled.rawPrompt || "cinematic subject", 150)
  const scene = clampText(compiled.scene || "cinematic scene", 100)
  const motion = clampText(compiled.motion || "slow dolly-in camera", 80)

  const prompt = [
    `${subject}.`,
    `Scene: ${scene}.`,
    `Camera: ${motion}.`,
    `Style: realistic cinematic trailer, high detail, coherent motion.`,
    `Rules: exact subject centered, no random people, no unrelated scene.`,
    `Format: ${compiled.aspectRatio}, ${NOVA_REEL_DURATION_SECONDS} seconds.`,
  ].join(" ")

  return ensure8KQualityPrompt(clampText(prompt, NOVA_REEL_PROMPT_LIMIT), NOVA_REEL_PROMPT_LIMIT)
}

function safeNovaDimension(aspectRatio?: VideoAspectRatio) {
  return aspectRatio === "9:16" ? "720x1280" : "1280x720"
}

function s3FromUri(uri: string) {
  const clean = validateS3Uri(uri).replace(/^s3:\/\//i, "")
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
  if (!isAwsNovaConfigured()) {
    return {
      ok: false,
      status: "failed",
      provider: PROVIDER,
      providerTitle: PROVIDER_TITLE,
      engine: ENGINE,
      publicError: "AWS Nova Reel is not configured. Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION and AWS_BEDROCK_VIDEO_S3_URI.",
      message: "Missing AWS Bedrock/S3 environment variables.",
    }
  }

  const compiled = compileGodVideoPrompt({
    prompt: input.prompt,
    durationSeconds: NOVA_REEL_DURATION_SECONDS,
    aspectRatio: input.aspectRatio || "16:9",
  })

  const { bedrock } = await sdk()
  const client = new bedrock.BedrockRuntimeClient({ region: awsRegion(), credentials: awsCredentials() })
  const s3Uri = validateS3Uri(videoS3Uri())
  const novaPrompt = buildNovaReelPrompt(compiled)

  const modelInput = {
    taskType: "TEXT_VIDEO",
    textToVideoParams: {
      text: novaPrompt,
    },
    videoGenerationConfig: {
      durationSeconds: NOVA_REEL_DURATION_SECONDS,
      fps: 24,
      dimension: safeNovaDimension(compiled.aspectRatio),
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
      provider: PROVIDER,
      providerTitle: PROVIDER_TITLE,
      engine: ENGINE,
      publicError: "AWS Bedrock did not return invocationArn.",
      message: "Nova Reel job could not be started.",
      compiledPrompt: novaPrompt,
      debug: response as unknown as Record<string, unknown>,
    }
  }

  return {
    ok: true,
    status: "queued",
    provider: PROVIDER,
    providerTitle: PROVIDER_TITLE,
    engine: ENGINE,
    jobId,
    statusUrl: `/api/generate/video/status?provider=aws-bedrock-nova-reel&jobId=${encodeURIComponent(jobId)}`,
    message: "Nova Reel video job queued.",
    compiledPrompt: novaPrompt,
  }
}

export async function pollAwsNovaReelVideo(jobId: string): Promise<StartResult> {
  if (!jobId) {
    return { ok: false, status: "failed", provider: PROVIDER, providerTitle: PROVIDER_TITLE, engine: ENGINE, publicError: "Missing jobId." }
  }

  const { bedrock, s3, presigner } = await sdk()
  const region = awsRegion()
  const credentials = awsCredentials()
  const bedrockClient = new bedrock.BedrockRuntimeClient({ region, credentials })
  const s3Client = new s3.S3Client({ region, credentials })

  const response = await bedrockClient.send(new bedrock.GetAsyncInvokeCommand({ invocationArn: jobId }))
  const status = String(response.status || "").toLowerCase()

  if (status.includes("failed")) {
    return {
      ok: false,
      status: "failed",
      provider: PROVIDER,
      providerTitle: PROVIDER_TITLE,
      engine: ENGINE,
      publicError: String((response as { failureMessage?: string }).failureMessage || "AWS Nova Reel generation failed."),
      debug: response as unknown as Record<string, unknown>,
    }
  }

  if (!status.includes("completed")) {
    return {
      ok: true,
      status: "rendering",
      provider: PROVIDER,
      providerTitle: PROVIDER_TITLE,
      engine: ENGINE,
      jobId,
      statusUrl: `/api/generate/video/status?provider=aws-bedrock-nova-reel&jobId=${encodeURIComponent(jobId)}`,
      message: `Nova Reel status: ${response.status || "InProgress"}`,
    }
  }

  const s3Uri =
    ((response as { outputDataConfig?: { s3OutputDataConfig?: { s3Uri?: string } } }).outputDataConfig?.s3OutputDataConfig?.s3Uri as string | undefined) ||
    videoS3Uri()

  const { bucket, prefix } = s3FromUri(s3Uri)
  const listed = await s3Client.send(new s3.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
  const object = (listed.Contents || [])
    .filter((item: { Key?: string }) => item.Key && /\.(mp4|mov|webm)$/i.test(item.Key))
    .sort((a: { LastModified?: Date }, b: { LastModified?: Date }) => Number(b.LastModified || 0) - Number(a.LastModified || 0))[0]

  if (!object?.Key) {
    return {
      ok: false,
      status: "failed",
      provider: PROVIDER,
      providerTitle: PROVIDER_TITLE,
      engine: ENGINE,
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
    provider: PROVIDER,
    providerTitle: PROVIDER_TITLE,
    engine: ENGINE,
    jobId,
    url: signedUrl,
    videoUrl: signedUrl,
    message: "Nova Reel video ready.",
  }
}
