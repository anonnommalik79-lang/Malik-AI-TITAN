import { CAPABILITIES, getCapabilitiesByIds } from "./registry"
import type { Capability, CapabilityCategory, CapabilitySuggestedMode, FeaturedCapabilityGroup, FeaturedCapabilityGroupResolved } from "./types"

export const FEATURED_CAPABILITY_GROUPS: FeaturedCapabilityGroup[] = [
  {
    id: "startups",
    title: "For Startups",
    capabilityIds: [
      "mvp-planner",
      "startup-roadmap",
      "investor-pitch-generator",
      "pitch-deck-outline",
      "demo-script-creator",
      "product-market-fit-analyzer",
    ],
  },
  {
    id: "developers",
    title: "For Developers",
    capabilityIds: [
      "typescript-code-generator",
      "next-js-component-generator",
      "api-route-generator",
      "bug-fixer",
      "error-explainer",
      "build-error-fixer",
    ],
  },
  {
    id: "business",
    title: "For Business",
    capabilityIds: [
      "business-idea-analyzer",
      "business-plan-generator",
      "pricing-strategy",
      "swot-analysis",
      "revenue-model-planner",
      "business-risk-checker",
    ],
  },
  {
    id: "students",
    title: "For Students",
    capabilityIds: [
      "explain-topic-simply",
      "exam-preparation-plan",
      "quiz-generator",
      "flashcard-generator",
      "essay-helper",
      "programming-tutor",
    ],
  },
  {
    id: "creators",
    title: "For Creators",
    capabilityIds: [
      "youtube-script-writer",
      "tiktok-video-idea-generator",
      "reels-storyboard",
      "thumbnail-text-generator",
      "content-calendar",
      "ai-image-prompt-generator",
    ],
  },
  {
    id: "kazakhstan",
    title: "For Kazakhstan",
    capabilityIds: [
      "kazakhstan-startup-idea-analyzer",
      "kazakh-russian-english-localization",
      "student-help-mode",
      "small-business-helper",
      "local-market-analysis",
      "digital-bridge-demo-mode",
    ],
  },
]

export type CapabilityRecommendationInput = {
  query?: string
  category?: CapabilityCategory | "All"
  mode?: CapabilitySuggestedMode | "All"
  tags?: string[]
  limit?: number
}

function searchableText(capability: Capability) {
  return `${capability.id} ${capability.title} ${capability.category} ${capability.description} ${capability.suggestedMode} ${capability.tags.join(" ")}`.toLowerCase()
}

function scoreCapability(capability: Capability, query: string, tags: string[]) {
  if (!query && !tags.length) return 1
  const haystack = searchableText(capability)
  let score = 0
  if (query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      if (capability.id.includes(token)) score += 5
      if (capability.title.toLowerCase().includes(token)) score += 4
      if (capability.category.toLowerCase().includes(token)) score += 3
      if (haystack.includes(token)) score += 1
    }
  }
  for (const tag of tags) {
    if (capability.tags.includes(tag.toLowerCase())) score += 3
  }
  return score
}

export function recommendCapabilities(input: CapabilityRecommendationInput = {}) {
  const query = input.query?.trim() || ""
  const tags = input.tags?.map((tag) => tag.toLowerCase()) || []
  const limit = Math.min(Math.max(input.limit || 24, 1), CAPABILITIES.length)

  return CAPABILITIES
    .filter((capability) => !input.category || input.category === "All" || capability.category === input.category)
    .filter((capability) => !input.mode || input.mode === "All" || capability.suggestedMode === input.mode)
    .map((capability) => ({ capability, score: scoreCapability(capability, query, tags) }))
    .filter((item) => !query && !tags.length ? true : item.score > 0)
    .sort((a, b) => b.score - a.score || a.capability.title.localeCompare(b.capability.title))
    .slice(0, limit)
    .map((item) => item.capability)
}

export function getFeaturedCapabilityGroups(limitPerGroup = 6): FeaturedCapabilityGroupResolved[] {
  return FEATURED_CAPABILITY_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    capabilities: getCapabilitiesByIds(group.capabilityIds).slice(0, limitPerGroup),
  }))
}

export function getHomepageFeaturedCapabilities() {
  return getFeaturedCapabilityGroups(3)
}
