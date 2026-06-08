import type { CapabilityCategoryDefinition, CapabilityModeDefinition } from "./types"

export const CAPABILITY_CATEGORIES: CapabilityCategoryDefinition[] = [
  { id: "chat-productivity", title: "Chat & Productivity", description: "Everyday writing, planning, summarizing and translation workflows." },
  { id: "business", title: "Business", description: "Practical business analysis, positioning, pricing and risk planning." },
  { id: "startup", title: "Startup", description: "Founder workflows from MVP planning to investor preparation." },
  { id: "marketing", title: "Marketing", description: "Campaign, social, SEO and copywriting accelerators." },
  { id: "sales", title: "Sales", description: "Sales messaging, qualification, offers and follow-up workflows." },
  { id: "code", title: "Code", description: "Code generation, debugging, architecture and deployment helpers." },
  { id: "design", title: "Design", description: "Product design, UX, layout and visual direction prompts." },
  { id: "documents", title: "Documents", description: "Document drafting, summaries, letters, reports and checklists." },
  { id: "education", title: "Education", description: "Learning support, tutoring, quizzes, flashcards and study plans." },
  { id: "research", title: "Research", description: "Research summaries, comparisons, trend analysis and source checks." },
  { id: "media-pr", title: "Media & PR", description: "Press, founder narratives, demos, interview and crisis drafts." },
  { id: "kazakhstan-impact", title: "Kazakhstan Impact", description: "Kazakhstan-focused localization, student, SMB and ecosystem workflows." },
  { id: "finance-planning", title: "Finance Planning", description: "Budgeting, cost planning, forecasts and financial checklists." },
  { id: "legal-drafting", title: "Legal Drafting", description: "Legal-adjacent drafting support, summaries and preparation checklists." },
  { id: "career", title: "Career", description: "CV, portfolio, applications, interviews and professional growth." },
  { id: "personal-life", title: "Personal Life", description: "Personal routines, goals, decisions and communication support." },
  { id: "psychology-support", title: "Psychology Support", description: "Reflective support prompts for stress, focus and emotional journaling." },
  { id: "creator-tools", title: "Creator Tools", description: "Video, content calendar, channel, slogan and monetization workflows." },
  { id: "video-image", title: "Video / Image", description: "Prompt engineering and creative direction for image and video generation." },
  { id: "operations-automation", title: "Operations / Automation", description: "Workflow and automation-oriented capability grouping." },
]

export const CAPABILITY_MODES: CapabilityModeDefinition[] = [
  { id: "fast", label: "Fast", description: "Short, practical output for quick work." },
  { id: "deep", label: "Deep", description: "Structured reasoning for analysis and planning." },
  { id: "pro", label: "Pro", description: "Premium long-form strategy and executive-quality output." },
  { id: "code", label: "Code", description: "Developer output optimized for code, debugging and architecture." },
  { id: "photo", label: "Photo", description: "Image prompt and visual generation workflows." },
  { id: "video", label: "Video", description: "Video prompt, storyboard and generation workflows." },
  { id: "memory", label: "Memory", description: "Context and retrieval workflows when memory is configured." },
]

export const CAPABILITY_CATEGORY_TITLES = CAPABILITY_CATEGORIES.map((category) => category.title)
