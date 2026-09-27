import "server-only"

export type GodCapability =
  | "chat"
  | "research"
  | "image"
  | "video"
  | "music"
  | "website"
  | "presentation"
  | "business"
  | "translator"
  | "analysis"

export type GodCapabilityDefinition = {
  id: GodCapability
  label: string
  endpoint: string
  method: "POST"
  outputKinds: string[]
  timeoutMs: number
  heavyBinaryExpected: false
}

const CAPABILITIES: Record<GodCapability, GodCapabilityDefinition> = {
  chat: {
    id: "chat", label: "Chat", endpoint: "/api/ai/chat", method: "POST",
    outputKinds: ["text", "code"], timeoutMs: 120_000, heavyBinaryExpected: false,
  },
  research: {
    id: "research", label: "Research", endpoint: "/api/malik-research", method: "POST",
    outputKinds: ["analysis", "document"], timeoutMs: 180_000, heavyBinaryExpected: false,
  },
  image: {
    id: "image", label: "Image", endpoint: "/api/media/image", method: "POST",
    outputKinds: ["image"], timeoutMs: 300_000, heavyBinaryExpected: false,
  },
  video: {
    id: "video", label: "Video", endpoint: "/api/generate/video", method: "POST",
    outputKinds: ["video"], timeoutMs: 300_000, heavyBinaryExpected: false,
  },
  music: {
    id: "music", label: "Music", endpoint: "/api/media/music", method: "POST",
    outputKinds: ["audio"], timeoutMs: 300_000, heavyBinaryExpected: false,
  },
  website: {
    id: "website", label: "Website", endpoint: "/api/generate/website", method: "POST",
    outputKinds: ["website", "code"], timeoutMs: 240_000, heavyBinaryExpected: false,
  },
  presentation: {
    id: "presentation", label: "Presentation", endpoint: "/api/presentations", method: "POST",
    outputKinds: ["presentation"], timeoutMs: 240_000, heavyBinaryExpected: false,
  },
  business: {
    id: "business", label: "Business", endpoint: "/api/business/autonomous", method: "POST",
    outputKinds: ["business-plan", "analysis"], timeoutMs: 180_000, heavyBinaryExpected: false,
  },
  translator: {
    id: "translator", label: "Translator", endpoint: "/api/translator", method: "POST",
    outputKinds: ["text", "document"], timeoutMs: 120_000, heavyBinaryExpected: false,
  },
  analysis: {
    id: "analysis", label: "Analysis", endpoint: "/api/ai/chat", method: "POST",
    outputKinds: ["analysis"], timeoutMs: 180_000, heavyBinaryExpected: false,
  },
}

export function isGodCapability(value: unknown): value is GodCapability {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CAPABILITIES, value)
}

export function godCapability(value: GodCapability) {
  return CAPABILITIES[value]
}

export function godCapabilityCatalog() {
  return Object.values(CAPABILITIES).map((item) => ({ ...item }))
}
