/** Milestones are VERIFIED SOFTWARE DELIVERY, not revenue or a legal business. */
export type LaunchReadinessInput = {
  completedAgents: number
  hasStandaloneHtml: boolean
  projectFiles: number
  qaPassed: boolean
  syntaxChecked: boolean
  deploymentUrl?: string
  deploymentState?: string
}
export type LaunchMilestone = {
  id: "strategy" | "preview" | "source" | "vercel"
  title: string
  detail: string
  points: number
  done: boolean
  blocked: boolean
}
export const EXTERNAL_LAUNCH_CHECKS = [
  "Проверить регистрацию бизнеса, налоги, договоры и разрешения в выбранной стране.",
  "Подключить реальные заявки, CRM и законную обработку персональных данных.",
  "Проверить домен, публичную доступность и безопасность продукта на телефоне.",
  "Если есть платежи — подключить провайдера, условия оплаты и возврата.",
  "Получить подтверждение спроса и тестовые продажи от реальных клиентов.",
] as const

export function assessBusinessLaunch(input: LaunchReadinessInput) {
  const state = String(input.deploymentState || "").toUpperCase()
  const failed = ["ERROR", "CANCELED", "CANCELLED"].includes(state)
  const sourceReady = input.projectFiles >= 8 && input.qaPassed === true && input.syntaxChecked === true
  const deployed = Boolean(input.deploymentUrl && state === "READY")
  const milestones: LaunchMilestone[] = [
    { id: "strategy", title: "8 бизнес-агентов", points: 20, done: input.completedAgents >= 8, blocked: false,
      detail: "Готовые документы, но не реальные действия на внешних сервисах." },
    { id: "preview", title: "Локальный MVP", points: 25, done: input.hasStandaloneHtml, blocked: false,
      detail: "HTML подготовлен; локальный предпросмотр не означает публикацию." },
    { id: "source", title: "Исходники + QA", points: 25, done: sourceReady, blocked: false,
      detail: "Next.js исходники прошли статическую проверку, но ещё не реальную сборку." },
    { id: "vercel", title: "Сборка Vercel READY", points: 30, done: deployed, blocked: failed,
      detail: failed ? "Vercel сообщил об ошибке — сборку необходимо исправить."
        : "Только READY подтверждает сборку; URL без READY не считается готовностью." },
  ]
  const score = milestones.reduce((sum, step) => sum + (step.done ? step.points : 0), 0)
  return {
    score,
    technicallyDelivered: score === 100,
    milestones,
    blockers: milestones.filter((item) => !item.done).map((item) => item.title),
    requiresManualBusinessVerification: true as const,
    externalChecks: [...EXTERNAL_LAUNCH_CHECKS],
  }
}
