import type { MalikFactAudit } from "@/lib/ai/fact-audit"

export type MalikWebSource = {
  title: string
  url: string
  domain: string
  snippet?: string
  provider?: string
  publishedAt?: string
}

export type MalikResearchStepKind = "plan" | "search" | "source" | "reading" | "done" | "error"

export type MalikResearchStep = {
  id: string
  kind: MalikResearchStepKind
  text: string
  domain?: string
  title?: string
  url?: string
  provider?: string
  at: number
}

export type MalikMessageResearch = {
  status: "searching" | "reading" | "done" | "error"
  usedWeb: boolean
  steps: MalikResearchStep[]
  sources: MalikWebSource[]
  startedAt: number
  tookMs?: number
  webSourceCount?: number
  /**
   * The answer's own figures and [n] markers, checked against the pages above.
   * Absent when there was nothing to check — see lib/ai/fact-audit.ts.
   */
  factAudit?: MalikFactAudit | null
}

export type MalikResearchProgress = Omit<MalikResearchStep, "id" | "at"> & {
  source?: MalikWebSource
}
