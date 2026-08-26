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
}

export type MalikResearchProgress = Omit<MalikResearchStep, "id" | "at"> & {
  source?: MalikWebSource
}
