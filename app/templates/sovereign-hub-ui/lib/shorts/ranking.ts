import type { MalikShortItem, MalikShortSource } from "@/lib/shorts/types"

export type RankingContext = {
  nowMs?: number
  language?: string
  region?: string
  followedCreators?: Set<string>
  blockedCreators?: Set<string>
  mutedCreators?: Set<string>
  notInterestedPosts?: Set<string>
  creatorAffinity?: Map<string, number>
  sourceAffinity?: Map<MalikShortSource, number>
  topicAffinity?: Map<string, number>
  postTopics?: Map<string, string[]>
  postFeatures?: Map<string, {
    quality?: number
    safety?: number
    novelty?: number
    creatorQuality?: number
  }>
}

export type RankedShort = {
  item: MalikShortItem
  score: number
  reasons: string[]
}

function clamp(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function logNorm(value: number, scale: number) {
  return clamp(Math.log1p(Math.max(0, value)) / Math.log1p(scale))
}

function ageFreshness(item: MalikShortItem, nowMs: number) {
  const date = Date.parse(String(item.publishedAt || item.createdAt || ""))
  if (!Number.isFinite(date)) return .35
  const ageHours = Math.max(0, (nowMs - date) / 3600000)
  if (ageHours <= 6) return 1
  if (ageHours <= 24) return .9
  if (ageHours <= 72) return .72
  if (ageHours <= 168) return .55
  if (ageHours <= 720) return .36
  return .2
}

function engagement(item: MalikShortItem) {
  const views = Math.max(1, Number(item.metrics.views || item.metrics.external?.views || 0))
  const likes = Number(item.metrics.likes || 0) + Number(item.metrics.external?.likes || 0)
  const comments = Number(item.metrics.comments || 0) + Number(item.metrics.external?.comments || 0)
  const saves = Number(item.metrics.saves || 0)
  const shares = Number(item.metrics.shares || 0) + Number(item.metrics.external?.shares || 0)
  const direct = clamp((likes + comments * 2.2 + saves * 3.4 + shares * 3.8) / Math.max(20, views * .16))
  const completion = clamp(Number(item.metrics.completionRate || 0))
  const reach = logNorm(views, 2_000_000)
  return direct * .55 + completion * .3 + reach * .15
}

export function scoreShort(item: MalikShortItem, context: RankingContext = {}): RankedShort {
  const now = context.nowMs || Date.now()
  const reasons: string[] = []
  if (context.blockedCreators?.has(item.creator.id) || context.mutedCreators?.has(item.creator.id)) {
    return { item, score: -1000, reasons: ["blocked-or-muted"] }
  }
  if (context.notInterestedPosts?.has(item.id)) return { item, score: -900, reasons: ["not-interested"] }

  const features = context.postFeatures?.get(item.id) || {}
  const quality = clamp(Number(features.quality ?? .55))
  const safety = clamp(Number(features.safety ?? 1))
  const novelty = clamp(Number(features.novelty ?? .5))
  const creatorQuality = clamp(Number(features.creatorQuality ?? .5))
  const fresh = ageFreshness(item, now)
  const engage = engagement(item)
  const creatorAffinity = clamp((Number(context.creatorAffinity?.get(item.creator.id) || 0) + 1) / 2)
  const sourceAffinity = clamp((Number(context.sourceAffinity?.get(item.source) || 0) + 1) / 2)
  const followed = context.followedCreators?.has(item.creator.id) || item.viewer.following

  const topics = context.postTopics?.get(item.id) || item.hashtags || []
  let topicAffinity = .5
  if (topics.length && context.topicAffinity) {
    const weights = topics.map((topic) => Number(context.topicAffinity?.get(topic) || 0))
    topicAffinity = clamp((Math.max(...weights, 0) + 1) / 2)
  }

  const languageMatch = context.language && item.language
    ? (String(context.language).toLowerCase() === String(item.language).toLowerCase() ? 1 : .35)
    : .6
  const regionMatch = context.region && item.region
    ? (String(context.region).toUpperCase() === String(item.region).toUpperCase() ? 1 : .5)
    : .65

  let score = 0
  score += engage * 2.2
  score += quality * 1.35
  score += safety * 1.65
  score += novelty * .72
  score += creatorQuality * .62
  score += fresh * .75
  score += creatorAffinity * 1.7
  score += sourceAffinity * .55
  score += topicAffinity * 1.45
  score += languageMatch * .7
  score += regionMatch * .42
  if (followed) score += 1.15
  if (item.source === "malik") score += .28

  if (engage > .7) reasons.push("strong-engagement")
  if (fresh > .8) reasons.push("fresh")
  if (creatorAffinity > .7) reasons.push("creator-affinity")
  if (topicAffinity > .7) reasons.push("topic-affinity")
  if (followed) reasons.push("following")
  if (languageMatch === 1) reasons.push("language-match")
  if (regionMatch === 1) reasons.push("region-match")
  if (item.source === "malik") reasons.push("malik-native")

  return { item, score: Number(score.toFixed(5)), reasons }
}

export function rankAndDiversify(items: MalikShortItem[], context: RankingContext = {}, limit = 20) {
  const ranked = items.map((item) => scoreShort(item, context)).filter((entry) => entry.score > -100)
  ranked.sort((a, b) => b.score - a.score)

  const output: RankedShort[] = []
  const creatorCounts = new Map<string, number>()
  const sourceCounts = new Map<MalikShortSource, number>()
  const remaining = [...ranked]

  while (output.length < limit && remaining.length) {
    let bestIndex = 0
    let bestAdjusted = -Infinity
    for (let index = 0; index < Math.min(remaining.length, 40); index += 1) {
      const candidate = remaining[index]
      const creatorRepeat = creatorCounts.get(candidate.item.creator.id) || 0
      const sourceRepeat = sourceCounts.get(candidate.item.source) || 0
      const creatorPenalty = creatorRepeat === 0 ? 0 : creatorRepeat === 1 ? .85 : 2.25
      const sourcePenalty = sourceRepeat > Math.max(2, Math.floor(output.length * .55)) ? .65 : 0
      const adjusted = candidate.score - creatorPenalty - sourcePenalty
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted
        bestIndex = index
      }
    }
    const [picked] = remaining.splice(bestIndex, 1)
    output.push({ ...picked, score: Number(bestAdjusted.toFixed(5)) })
    creatorCounts.set(picked.item.creator.id, (creatorCounts.get(picked.item.creator.id) || 0) + 1)
    sourceCounts.set(picked.item.source, (sourceCounts.get(picked.item.source) || 0) + 1)
  }

  return output
}
