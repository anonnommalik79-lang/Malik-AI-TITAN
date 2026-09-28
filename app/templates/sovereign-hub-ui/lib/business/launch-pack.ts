export type LaunchPhase = { outcome: string; actions: string[]; evidence: string[] }
export type LaunchPack = {
  roadmap: { day7: LaunchPhase; day30: LaunchPhase; day90: LaunchPhase }
  pitches: { seconds30: string; minutes2: string; minutes5: string }
  openQuestions: string[]
}

function sentence(value: unknown, max = 2500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function list(value: unknown, max = 8): string[] {
  return Array.isArray(value) ? value.map((item) => sentence(item, 400)).filter(Boolean).slice(0, max) : []
}

function phase(value: unknown): LaunchPhase | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const result = { outcome: sentence(raw.outcome, 300), actions: list(raw.actions), evidence: list(raw.evidence) }
  return result.outcome && result.actions.length >= 2 && result.evidence.length ? result : null
}

export function normalizeLaunchPack(value: unknown): LaunchPack | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const roadmap = raw.roadmap && typeof raw.roadmap === "object" ? raw.roadmap as Record<string, unknown> : {}
  const pitches = raw.pitches && typeof raw.pitches === "object" ? raw.pitches as Record<string, unknown> : {}
  const day7 = phase(roadmap.day7)
  const day30 = phase(roadmap.day30)
  const day90 = phase(roadmap.day90)
  const seconds30 = sentence(pitches.seconds30)
  const minutes2 = sentence(pitches.minutes2, 5000)
  const minutes5 = sentence(pitches.minutes5, 9000)
  if (!day7 || !day30 || !day90 || seconds30.length < 50 || minutes2.length < 150 || minutes5.length < 250) return null
  return { roadmap: { day7, day30, day90 }, pitches: { seconds30, minutes2, minutes5 }, openQuestions: list(raw.openQuestions, 12) }
}

export function roadmapMarkdown(pack: LaunchPack): string {
  return ["# План запуска · 7 / 30 / 90 дней", "", "Действия — рекомендации, а не уже достигнутые результаты.",
    ...([7, 30, 90] as const).flatMap((days) => {
      const phase = pack.roadmap[`day${days}`]
      return ["", `## До ${days}-го дня`, "", `**Результат:** ${phase.outcome}`, "", "**Действия**", ...phase.actions.map((action) => `- ${action}`), "", "**Как проверить**", ...phase.evidence.map((item) => `- ${item}`)]
    }),
    ...(pack.openQuestions.length ? ["", "## Что уточнить", ...pack.openQuestions.map((item) => `- ${item}`)] : []),
  ].join("\n")
}

export function pitchesMarkdown(pack: LaunchPack): string {
  return ["# Питч проекта", "", "Черновики основаны на известных фактах проекта. Незаполненные показатели не являются подтверждённой выручкой или traction.",
    "", "## 30 секунд", "", pack.pitches.seconds30,
    "", "## 2 минуты", "", pack.pitches.minutes2,
    "", "## 5 минут", "", pack.pitches.minutes5,
    ...(pack.openQuestions.length ? ["", "## Факты для подтверждения перед инвестором", ...pack.openQuestions.map((item) => `- ${item}`)] : []),
  ].join("\n")
}
