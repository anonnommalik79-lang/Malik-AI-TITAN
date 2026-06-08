export type CapabilitySuggestedMode = "fast" | "deep" | "pro" | "code" | "photo" | "video"

export type CapabilityRiskLevel = "low" | "medium" | "high"

export type CapabilityCategory =
  | "Chat & Productivity"
  | "Business"
  | "Startup"
  | "Marketing"
  | "Sales"
  | "Code"
  | "Design"
  | "Documents"
  | "Education"
  | "Research"
  | "Media & PR"
  | "Kazakhstan Impact"
  | "Finance Planning"
  | "Legal Drafting"
  | "Career"
  | "Personal Life"
  | "Psychology Support"
  | "Creator Tools"
  | "Video / Image"
  | "Operations / Automation"

export type Capability = {
  id: string
  title: string
  category: CapabilityCategory
  description: string
  suggestedMode: CapabilitySuggestedMode
  promptTemplate: string
  tags: string[]
  riskLevel: CapabilityRiskLevel
  disclaimer?: string
}

export type CapabilityCategoryDefinition = {
  id: string
  title: CapabilityCategory
  description: string
}

export type CapabilityModeDefinition = {
  id: CapabilitySuggestedMode | "memory"
  label: string
  description: string
}

export type FeaturedCapabilityGroup = {
  id: string
  title: string
  capabilityIds: string[]
}

export type FeaturedCapabilityGroupResolved = {
  id: string
  title: string
  capabilities: Capability[]
}
