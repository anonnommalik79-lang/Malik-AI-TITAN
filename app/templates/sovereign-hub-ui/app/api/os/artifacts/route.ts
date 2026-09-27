import { semanticSearch, type Embedder } from "@/lib/os/library"
import { osError, osJson, osOwner } from "@/lib/os/http"
import { artifactIndex, storeIsDurable } from "@/lib/os/store"
import type { ArtifactKind } from "@/lib/os/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KINDS = new Set<ArtifactKind>(["text", "code", "image", "video", "audio", "website", "presentation", "document", "dataset", "analysis", "business-plan"])

type EmbedGlobal = typeof globalThis & { __malikOsEmbeddings?: Map<string, number[]> }

function embeddingCache() {
  const scope = globalThis as EmbedGlobal
  if (!scope.__malikOsEmbeddings) scope.__malikOsEmbeddings = new Map()
  if (scope.__malikOsEmbeddings.size > 3_000) scope.__malikOsEmbeddings.clear()
  return scope.__malikOsEmbeddings
}

async function embedder(): Promise<Embedder | null> {
  if (!String(process.env.BEDROCK_EMBEDDING_MODEL_ID || "").trim()) return null
  const { embedWithBedrock } = await import("@/lib/ai/providers/bedrock-embedding-provider")
  return async (text) => {
    const result = await embedWithBedrock(text)
    const vector = (result.output as { embedding?: number[] } | undefined)?.embedding
    return result.success && Array.isArray(vector) ? vector : null
  }
}

/** The universal library: every artifact, filtered and searched by meaning. */
export async function GET(request: Request) {
  try {
    const owner = await osOwner(request)
    if (!owner.authenticated) return osJson({ ok: true, mode: "none", artifacts: [], durable: await storeIsDurable() })
    const url = new URL(request.url)
    const query = String(url.searchParams.get("q") || "").trim().slice(0, 300)
    const kindParam = url.searchParams.get("kind") as ArtifactKind | null
    const kind = kindParam && KINDS.has(kindParam) ? kindParam : undefined
    const projectId = url.searchParams.get("projectId") || undefined
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 40))
    const index = await artifactIndex(owner.userId)
    if (!query) {
      const artifacts = index.filter((entry) => (!kind || entry.kind === kind) && (!projectId || entry.projectId === projectId)).slice(0, limit)
      return osJson({ ok: true, mode: "recent", artifacts, durable: await storeIsDurable() })
    }
    const result = await semanticSearch(index, query, { kind, projectId, limit }, await embedder(), embeddingCache())
    return osJson({ ok: true, mode: result.mode, artifacts: result.hits, durable: await storeIsDurable() })
  } catch (error) {
    return osError(error)
  }
}
