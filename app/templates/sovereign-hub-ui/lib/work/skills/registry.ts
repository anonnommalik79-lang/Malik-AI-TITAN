import "server-only"
import { access } from "node:fs/promises"
import path from "node:path"
import { toolCatalog } from "@/lib/os/tools/registry"
import { dailyFlowLimit } from "@/lib/os/http"
import type { OwnerContext } from "@/lib/os/tools/contract"
import { getPipesProviderState } from "@/lib/server/plugin-pipes"
import { maxLaneStatus } from "@/lib/server/malik-max-engine"
export type WorkSkill = { id: string; label: string; executor: "engine" | "model" | "external"; status: "ready" | "needs-connection" | "plan-required"; detail: string; timeoutMs: number; sideEffect: "none" | "paid" | "external" }
export async function workSkillCatalog(owner: OwnerContext): Promise<WorkSkill[]> {
  const [lanes, github, fonts] = await Promise.all([
    maxLaneStatus().catch(() => []),
    owner.authenticated ? getPipesProviderState(owner.userId, "github").catch(() => null) : Promise.resolve(null),
    Promise.all(["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSansMono.ttf"].map(name => access(path.join(process.cwd(), "assets", "fonts", name)))).then(() => true).catch(() => false),
  ])
  const modelConfigured = lanes.some(lane => !lane.restingMs)
  const skills: WorkSkill[] = [
    { id: "math.compute", label: "Математический движок", executor: "engine", status: "ready", detail: "Детерминированный расчёт с проверками, без модели.", timeoutMs: 10000, sideEffect: "none" },
    { id: "document.export", label: "Экспорт документов", executor: "engine", status: fonts ? "ready" : "needs-connection", detail: fonts ? "DOCX, PDF, XLSX, CSV, MD, TXT, HTML, JSON, ZIP." : "Для PDF отсутствуют локальные шрифты assets/fonts. Остальные форматы доступны через экспорт.", timeoutMs: 20000, sideEffect: "none" },
  ]
  for (const tool of toolCatalog()) {
    const isExternal = tool.name === "research.web" || tool.name === "image.generate"
    const needsModel = tool.name !== "data.analyze" && tool.name !== "result.assemble" && tool.name !== "image.generate"
    const blocked = !owner.authenticated || dailyFlowLimit(owner) === 0
    skills.push({ id: tool.name, label: tool.label, executor: isExternal ? "external" : "model", timeoutMs: tool.timeoutMs, sideEffect: tool.sideEffect, status: blocked ? "plan-required" : needsModel && !modelConfigured ? "needs-connection" : "ready", detail: blocked ? "Войдите в аккаунт с доступом к Superflow." : needsModel && !modelConfigured ? "Подключите провайдера модели в настройках сервера." : "Запускается исполнителем Superflow; квоты и доступ проверяются при вызове. Статус подключения не гарантирует доступность провайдера." })
  }
  for (const operation of ["read", "write"]) skills.push({ id: `github.${operation}`, label: operation === "read" ? "Чтение GitHub" : "Изменения GitHub", executor: "external", timeoutMs: 30000, sideEffect: operation === "read" ? "none" : "external", status: github?.connected && operation === "read" ? "ready" : "needs-connection", detail: !github?.connected ? "GitHub не подключён. Откройте Плагины → GitHub → Подключить." : operation === "read" ? "Чтение через токен вашего подключения WorkOS Pipes." : "Запись пока не подключена: требуется исполнитель с подтверждением." })
  return skills
}
