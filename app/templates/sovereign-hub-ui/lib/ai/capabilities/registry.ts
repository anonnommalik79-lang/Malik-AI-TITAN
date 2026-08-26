import { CAPABILITY_CATEGORIES, CAPABILITY_MODES } from "./categories"
import type { Capability, CapabilityCategory, CapabilityRiskLevel, CapabilitySuggestedMode } from "./types"

export const CAPABILITY_REGISTRY_VERSION = "malik-capabilities-200"
export const EXPECTED_CAPABILITY_COUNT = 200

const LEGAL_DISCLAIMER = "MALIK AI can help draft and summarize, but does not replace a licensed lawyer."
const PSYCHOLOGY_DISCLAIMER =
  "MALIK AI provides support and reflection, but does not replace a psychologist, doctor or emergency help."
const FINANCE_DISCLAIMER = "MALIK AI helps with planning and education only; verify important financial decisions with a qualified professional."

type CapabilityGroupSeed = {
  category: CapabilityCategory
  suggestedMode: CapabilitySuggestedMode
  tags: string[]
  titles: string[]
}

const CAPABILITY_GROUP_SEEDS: CapabilityGroupSeed[] = [
  {
    category: "Chat & Productivity",
    suggestedMode: "fast",
    tags: ["chat", "productivity", "writing"],
    titles: [
      "Daily planner",
      "Task prioritizer",
      "Meeting summarizer",
      "Email writer",
      "Email rewriter",
      "Telegram message writer",
      "Short answer generator",
      "Long answer generator",
      "Translation RU/KZ/EN",
      "Text simplifier",
    ],
  },
  {
    category: "Business",
    suggestedMode: "deep",
    tags: ["business", "strategy", "planning"],
    titles: [
      "Business idea analyzer",
      "Business plan generator",
      "Competitor analysis",
      "Pricing strategy",
      "Customer persona builder",
      "SWOT analysis",
      "Market positioning",
      "Revenue model planner",
      "Unit economics explainer",
      "Business risk checker",
    ],
  },
  {
    category: "Startup",
    suggestedMode: "pro",
    tags: ["startup", "founder", "launch"],
    titles: [
      "MVP planner",
      "Startup roadmap",
      "Investor pitch generator",
      "Pitch deck outline",
      "Demo script creator",
      "Founder story builder",
      "Product-market fit analyzer",
      "Startup launch checklist",
      "Startup KPI planner",
      "Investor Q&A simulator",
    ],
  },
  {
    category: "Marketing",
    suggestedMode: "fast",
    tags: ["marketing", "content", "growth"],
    titles: [
      "Content plan generator",
      "TikTok script writer",
      "Instagram caption writer",
      "LinkedIn post writer",
      "Ad copy generator",
      "Landing page copywriter",
      "Brand voice creator",
      "Marketing campaign planner",
      "SEO title generator",
      "Viral hook generator",
    ],
  },
  {
    category: "Sales",
    suggestedMode: "fast",
    tags: ["sales", "clients", "outreach"],
    titles: [
      "Sales script writer",
      "Cold DM generator",
      "Client objection handler",
      "Offer builder",
      "Commercial proposal writer",
      "Follow-up message writer",
      "B2B pitch writer",
      "Lead qualification assistant",
      "Sales funnel planner",
      "Closing message generator",
    ],
  },
  {
    category: "Code",
    suggestedMode: "code",
    tags: ["code", "developer", "engineering"],
    titles: [
      "TypeScript code generator",
      "Next.js component generator",
      "React component builder",
      "API route generator",
      "Bug fixer",
      "Error explainer",
      "Refactor assistant",
      "Performance optimizer",
      "Security checker",
      "Deployment helper",
      "AI router generator",
      "Provider fallback builder",
      "Env validation generator",
      "Server/client boundary checker",
      "Database schema helper",
      "WorkOS AuthKit helper",
      "Auth flow builder",
      "GitHub README generator",
      "Git command helper",
      "Build error fixer",
    ],
  },
  {
    category: "Design",
    suggestedMode: "deep",
    tags: ["design", "ux", "ui"],
    titles: [
      "UI improvement advisor",
      "Landing page structure",
      "Hero section copy",
      "Color palette generator",
      "Button design advisor",
      "Mobile layout fixer",
      "Dashboard layout planner",
      "Design system builder",
      "Premium card copywriter",
      "UX audit assistant",
    ],
  },
  {
    category: "Documents",
    suggestedMode: "deep",
    tags: ["documents", "drafting", "reports"],
    titles: [
      "PDF summarizer",
      "Contract explainer",
      "Application letter writer",
      "Complaint letter writer",
      "Resume writer",
      "Motivation letter writer",
      "Cover letter writer",
      "Report writer",
      "Proposal writer",
      "Document checklist maker",
    ],
  },
  {
    category: "Education",
    suggestedMode: "deep",
    tags: ["education", "learning", "tutor"],
    titles: [
      "Explain topic simply",
      "Exam preparation plan",
      "Quiz generator",
      "Flashcard generator",
      "Essay helper",
      "Math explanation",
      "Programming tutor",
      "English learning assistant",
      "Kazakh language assistant",
      "Turkish learning assistant",
    ],
  },
  {
    category: "Research",
    suggestedMode: "deep",
    tags: ["research", "analysis", "sources"],
    titles: [
      "Research summary",
      "Topic comparison",
      "Pros and cons table",
      "Source checklist",
      "Hypothesis generator",
      "Data insight generator",
      "Trend analyzer",
      "Report outline",
      "Research question builder",
      "Fact-checking checklist",
    ],
  },
  {
    category: "Media & PR",
    suggestedMode: "pro",
    tags: ["media", "pr", "press"],
    titles: [
      "Press release writer",
      "Journalist pitch writer",
      "Media kit checklist",
      "Founder quote generator",
      "60-second demo script",
      "Product story builder",
      "News angle generator",
      "Interview Q&A prep",
      "LinkedIn founder post",
      "PR crisis response draft",
    ],
  },
  {
    category: "Kazakhstan Impact",
    suggestedMode: "deep",
    tags: ["kazakhstan", "localization", "impact"],
    titles: [
      "Kazakhstan startup idea analyzer",
      "Kazakh/Russian/English localization",
      "Student help mode",
      "Small business helper",
      "Public problem analyzer",
      "Bureaucracy document helper",
      "City problem idea generator",
      "Local market analysis",
      "Kazakhstan media pitch",
      "Digital Bridge demo mode",
    ],
  },
  {
    category: "Finance Planning",
    suggestedMode: "deep",
    tags: ["finance", "budget", "planning"],
    titles: [
      "Personal budget planner",
      "Startup cost planner",
      "Subscription pricing planner",
      "Savings plan",
      "Revenue forecast template",
      "Expense tracker explanation",
      "Financial risk checklist",
      "Investor budget summary",
      "Break-even explainer",
      "Cost reduction ideas",
    ],
  },
  {
    category: "Legal Drafting",
    suggestedMode: "deep",
    tags: ["legal", "drafting", "documents"],
    titles: [
      "Simple legal text explainer",
      "Contract risk checklist",
      "Complaint draft",
      "Request letter draft",
      "Terms of service outline",
      "Privacy policy outline",
      "Legal FAQ draft",
      "Document preparation checklist",
      "Legal email writer",
      "Disclaimer generator",
    ],
  },
  {
    category: "Career",
    suggestedMode: "deep",
    tags: ["career", "jobs", "professional"],
    titles: [
      "CV builder",
      "Portfolio builder",
      "Job application writer",
      "Interview preparation",
      "Career roadmap",
      "LinkedIn profile improver",
      "Freelance proposal writer",
      "Skill gap analyzer",
      "Study plan for career",
      "Professional bio writer",
    ],
  },
  {
    category: "Personal Life",
    suggestedMode: "fast",
    tags: ["personal", "goals", "communication"],
    titles: [
      "Habit planner",
      "Discipline coach",
      "Weekly routine builder",
      "Goal planner",
      "Decision helper",
      "Conversation preparation",
      "Apology message writer",
      "Conflict de-escalation",
      "Personal reflection",
      "Confidence builder",
    ],
  },
  {
    category: "Psychology Support",
    suggestedMode: "deep",
    tags: ["support", "reflection", "wellbeing"],
    titles: [
      "Stress support",
      "Anxiety grounding guide",
      "Emotional journal helper",
      "Motivation support",
      "Public speaking support",
      "Breakup reflection helper",
      "Anger control plan",
      "Sleep routine helper",
      "Focus recovery",
      "Self-talk reframe",
    ],
  },
  {
    category: "Creator Tools",
    suggestedMode: "fast",
    tags: ["creator", "content", "video"],
    titles: [
      "YouTube script writer",
      "TikTok video idea generator",
      "Reels storyboard",
      "Short video hook generator",
      "Thumbnail text generator",
      "Channel bio writer",
      "Content calendar",
      "Brand slogan generator",
      "Viral challenge idea",
      "Creator monetization plan",
    ],
  },
  {
    category: "Video / Image",
    suggestedMode: "photo",
    tags: ["image", "video", "prompt"],
    titles: [
      "AI image prompt generator",
      "AI video prompt generator",
      "Product promo scene generator",
      "Cinematic trailer prompt",
      "Startup visual concept",
      "Logo prompt assistant",
      "Background prompt builder",
      "Social banner prompt",
      "Video job/status assistant",
      "Image editing instruction generator",
    ],
  },
]

const MODE_OVERRIDES: Record<string, CapabilitySuggestedMode> = {
  "Business plan generator": "pro",
  "Pricing strategy": "pro",
  "Revenue model planner": "pro",
  "Commercial proposal writer": "pro",
  "Marketing campaign planner": "deep",
  "Sales funnel planner": "deep",
  "Content calendar": "deep",
  "Creator monetization plan": "pro",
  "YouTube script writer": "video",
  "TikTok video idea generator": "video",
  "Reels storyboard": "video",
  "Short video hook generator": "video",
  "AI video prompt generator": "video",
  "Product promo scene generator": "video",
  "Cinematic trailer prompt": "video",
  "Video job/status assistant": "video",
  "AI image prompt generator": "photo",
  "Startup visual concept": "photo",
  "Logo prompt assistant": "photo",
  "Background prompt builder": "photo",
  "Social banner prompt": "photo",
  "Image editing instruction generator": "photo",
}

const CATEGORY_GUIDES: Record<CapabilityCategory, string> = {
  "Chat & Productivity": "Return a concise, usable productivity result. Include the final draft or plan first, then a short next-step list.",
  Business: "Structure the answer as executive summary, assumptions, analysis, recommendation, risks and next steps.",
  Startup: "Answer like a founder operator. Include roadmap, tradeoffs, execution checklist and investor-ready framing when relevant.",
  Marketing: "Produce clear copy or a campaign plan with audience, channel, hook, message, variants and next action.",
  Sales: "Produce practical sales language with buyer context, offer, objection handling and follow-up wording.",
  Code: "Return production-minded engineering help. Include code or commands when useful, plus risks, validation and deployment notes.",
  Design: "Give design direction that is specific, responsive and implementation-ready without inventing fake metrics.",
  Documents: "Create polished document content with sections, checklist, tone and missing information clearly marked.",
  Education: "Teach step by step, check understanding, include examples and adapt to the learner level in the input.",
  Research: "Separate known facts, assumptions, comparison points, source-check checklist and unanswered questions.",
  "Media & PR": "Create press-ready messaging with audience, angle, quote or talking points, and a risk-aware review checklist.",
  "Kazakhstan Impact": "Localize for Kazakhstan where useful. Consider Kazakh/Russian/English language needs and practical local constraints.",
  "Finance Planning": "Use simple planning math, assumptions, tables and risk notes. Do not provide personalized financial advice.",
  "Legal Drafting": "Draft or explain in plain language, mark assumptions, identify risks, and tell the user to consult a licensed lawyer.",
  Career: "Produce job-market-ready wording, a clear improvement plan and action steps tailored to the user's target role.",
  "Personal Life": "Be practical, respectful and non-judgmental. Offer scripts, plans and reflection prompts without overreaching.",
  "Psychology Support": "Use supportive, grounded language. Avoid diagnosis. Encourage emergency or professional help when safety may be at risk.",
  "Creator Tools": "Create content that is immediately usable with hook, structure, variants and publishing checklist.",
  "Video / Image": "Create visual prompts with subject, scene, style, composition, lighting, camera, motion and negative constraints when useful.",
  "Operations / Automation": "Create operational workflows with trigger, steps, owner, tools, risks and verification checks.",
}

const DESCRIPTION_BY_CATEGORY: Record<CapabilityCategory, string> = {
  "Chat & Productivity": "turns everyday context into a clear ready-to-use productivity output",
  Business: "turns business context into structured strategy and practical next moves",
  Startup: "turns founder context into an execution-ready startup workflow",
  Marketing: "turns campaign context into practical marketing copy or planning",
  Sales: "turns buyer context into clear sales messaging and follow-up actions",
  Code: "turns engineering context into implementation-ready technical guidance",
  Design: "turns product context into specific UI, UX or visual direction",
  Documents: "turns raw material into polished document content or checklists",
  Education: "turns a learning goal into a clear study or tutoring workflow",
  Research: "turns a topic into structured research notes and verification steps",
  "Media & PR": "turns product context into media-ready messaging",
  "Kazakhstan Impact": "turns local context into Kazakhstan-aware practical output",
  "Finance Planning": "turns numbers and goals into educational planning templates",
  "Legal Drafting": "turns legal-adjacent context into draft text and review checklists",
  Career: "turns career context into practical job-market materials",
  "Personal Life": "turns personal context into respectful plans, scripts or reflections",
  "Psychology Support": "turns emotional context into supportive reflection and grounding steps",
  "Creator Tools": "turns creator context into publishable content ideas or assets",
  "Video / Image": "turns visual context into strong prompt and scene direction",
  "Operations / Automation": "turns operational context into a workflow plan",
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function unique(values: string[]) {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const clean = value.trim().toLowerCase()
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    output.push(clean)
  }
  return output
}

function titleTags(title: string) {
  const stop = new Set(["and", "or", "the", "a", "an", "for", "to", "of", "ru", "kz", "en"])
  return title
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .split(/[ /]+/)
    .filter((token) => token.length > 2 && !stop.has(token))
}

function riskFor(category: CapabilityCategory, title: string): CapabilityRiskLevel {
  if (category === "Legal Drafting" || title === "Contract explainer") return "high"
  if (category === "Psychology Support") return "high"
  if (category === "Finance Planning") return "medium"
  if (/risk|security|contract|privacy|terms|complaint|bureaucracy|crisis|conflict/i.test(title)) return "medium"
  return "low"
}

function disclaimerFor(category: CapabilityCategory, title: string) {
  if (category === "Legal Drafting" || /contract|terms|privacy|legal/i.test(title)) return LEGAL_DISCLAIMER
  if (category === "Psychology Support") return PSYCHOLOGY_DISCLAIMER
  if (category === "Finance Planning") return FINANCE_DISCLAIMER
  return undefined
}

function descriptionFor(category: CapabilityCategory, title: string) {
  return `${title} ${DESCRIPTION_BY_CATEGORY[category]}.`
}

function promptTemplateFor(capability: {
  title: string
  category: CapabilityCategory
  suggestedMode: CapabilitySuggestedMode
  riskLevel: CapabilityRiskLevel
  disclaimer?: string
}) {
  const disclaimer = capability.disclaimer ? `\nSafety note: ${capability.disclaimer}` : ""
  return [
    `You are MALIK AI running the "${capability.title}" capability.`,
    `Category: ${capability.category}.`,
    `Suggested mode: ${capability.suggestedMode}.`,
    `Risk level: ${capability.riskLevel}.`,
    CATEGORY_GUIDES[capability.category],
    "Use the user's context below. If details are missing, make conservative assumptions and label them.",
    "User context:",
    "{{input}}",
    "Output requirements:",
    "- Start with the most useful result, draft or recommendation.",
    "- Keep it practical and specific.",
    "- Include a short checklist or next actions.",
    "- Do not invent clients, revenue, users, partnerships or metrics.",
    "- Do not expose secrets or request private API keys.",
    disclaimer,
  ]
    .filter(Boolean)
    .join("\n")
}

function buildCapabilities(): Capability[] {
  return CAPABILITY_GROUP_SEEDS.flatMap((group) =>
    group.titles.map((title) => {
      const suggestedMode = MODE_OVERRIDES[title] || group.suggestedMode
      const riskLevel = riskFor(group.category, title)
      const disclaimer = disclaimerFor(group.category, title)
      const capability = {
        id: slugify(title),
        title,
        category: group.category,
        description: descriptionFor(group.category, title),
        suggestedMode,
        riskLevel,
        disclaimer,
      }

      return {
        ...capability,
        promptTemplate: promptTemplateFor(capability),
        tags: unique([slugify(group.category), ...group.tags, ...titleTags(title), suggestedMode, riskLevel]),
      }
    }),
  )
}

export const CAPABILITIES: Capability[] = buildCapabilities()

function assertRegistryIntegrity() {
  const ids = new Set<string>()
  for (const capability of CAPABILITIES) {
    if (ids.has(capability.id)) throw new Error(`Duplicate capability id: ${capability.id}`)
    ids.add(capability.id)
  }
  if (CAPABILITIES.length !== EXPECTED_CAPABILITY_COUNT) {
    throw new Error(`Capability registry expected ${EXPECTED_CAPABILITY_COUNT}, got ${CAPABILITIES.length}`)
  }
}

assertRegistryIntegrity()

export function getCapabilityById(id: string) {
  return CAPABILITIES.find((capability) => capability.id === id)
}

export function getCapabilitiesByIds(ids: string[]) {
  const wanted = new Set(ids)
  return CAPABILITIES.filter((capability) => wanted.has(capability.id))
}

export function getCapabilitiesByCategory(category: CapabilityCategory) {
  return CAPABILITIES.filter((capability) => capability.category === category)
}

export function getCapabilityCategorySummaries() {
  return CAPABILITY_CATEGORIES.map((category) => ({
    ...category,
    count: CAPABILITIES.filter((capability) => capability.category === category.title).length,
  })).filter((category) => category.count > 0)
}

export function renderCapabilityPrompt(capability: Capability, input: string) {
  const cleanInput = input.trim() || "No extra context was provided. Create a useful starter output and ask only essential follow-up questions."
  return capability.promptTemplate.split("{{input}}").join(cleanInput)
}

export function getPublicCapabilityRegistry() {
  return {
    ok: true,
    version: CAPABILITY_REGISTRY_VERSION,
    count: CAPABILITIES.length,
    categories: getCapabilityCategorySummaries(),
    capabilities: CAPABILITIES,
    modes: CAPABILITY_MODES,
  }
}
