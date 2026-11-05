import type { SkillDefinition, SkillId, SkillStepSpec, SkillTool } from "./types"

const step = (id: string, tool: SkillTool, label: string, dependencies: string[] = [], timeoutMs = 60_000): SkillStepSpec => ({ id, tool, label, dependencies, timeoutMs })
const definitions: SkillDefinition[] = [
  { id: "forge.autopilot", version: 1, name: "FORGE AUTOPILOT", description: "План → исходники моделью → статический QA → изолированные тесты при доступности → проверенный артефакт.",
    tools: ["plan", "build", "inspect", "test", "publish", "verify"], steps: [
      step("plan", "plan", "Уточняю требования и критерии"), step("build", "build", "Пишу файлы проекта", ["plan"], 95_000),
      step("inspect", "inspect", "Проверяю синтаксис, импорты и пути", ["build"]), step("test", "test", "Проверяю возможность изолированного запуска", ["inspect"], 70_000),
      step("publish", "publish", "Сохраняю проверенные исходники", ["inspect", "test"]), step("verify", "verify", "Проверяю результат и квитанции", ["publish"]),
    ] },
  { id: "deep.research", version: 1, name: "DEEP RESEARCH", description: "План исследования → поиск → чтение страниц → синтез → проверка ссылок, дат и чисел.",
    tools: ["plan", "search", "read", "write", "verify"], steps: [
      step("plan", "plan", "Планирую исследование"), step("search", "search", "Ищу открытые источники", ["plan"], 45_000),
      step("read", "read", "Читаю найденные страницы", ["search"], 35_000), step("write", "write", "Сопоставляю источники", ["read"]), step("verify", "verify", "Проверяю ссылки, даты и расчёты", ["write"]),
    ] },
  { id: "agent.team", version: 1, name: "AGENT TEAM", description: "Исследователь, исполнитель и рецензент выполняют отдельные роли с собственными квитанциями; код создаётся инструментом проекта.",
    tools: ["plan", "researcher", "implementer", "reviewer", "verify"], steps: [
      step("plan", "plan", "Распределяю работу по ролям"), step("researcher", "researcher", "Исследователь проверяет исходные данные", ["plan"], 75_000),
      step("implementer", "implementer", "Исполнитель создаёт результат", ["researcher"], 95_000), step("reviewer", "reviewer", "Рецензент проверяет результат", ["implementer"]), step("verify", "verify", "Сверяю результат с квитанциями", ["reviewer"]),
    ] },
  { id: "malik.verify", version: 1, name: "MALIK VERIFY", description: "Детерминированные вычисления, проверка внешних ссылок при необходимости и отдельное модельное ревью; границы проверки явные.",
    tools: ["researcher", "reviewer", "verify"], steps: [
      step("researcher", "researcher", "Собираю подтверждения для проверки", [], 75_000), step("reviewer", "reviewer", "Проверяю ответ моделью", ["researcher"]), step("verify", "verify", "Сверяю числа и доказательства", ["reviewer"]),
    ] },
]

/** Validate at module initialization: an invalid graph cannot reach execution. */
function validate(definition: SkillDefinition) {
  const seen = new Set<string>()
  for (const item of definition.steps) {
    if (seen.has(item.id) || !definition.tools.includes(item.tool) || item.dependencies.some(id => !seen.has(id))) throw new Error("INVALID_SKILL_GRAPH")
    seen.add(item.id)
  }
  return Object.freeze({ ...definition, tools: Object.freeze([...definition.tools]), steps: Object.freeze(definition.steps.map(s => Object.freeze({ ...s, dependencies: Object.freeze([...s.dependencies]) }))) })
}
export const SKILL_REGISTRY = Object.freeze(Object.fromEntries(definitions.map(d => [d.id, validate(d)])))
export function skillDefinition(id: unknown): Readonly<SkillDefinition> | null {
  return typeof id === "string" && Object.hasOwn(SKILL_REGISTRY, id) ? SKILL_REGISTRY[id] as unknown as SkillDefinition : null
}
export const skillIds = () => definitions.map(d => d.id)

const aliases: Array<[SkillId, RegExp]> = [
  ["forge.autopilot", /^(?:\/forge|@?forge[ -]autopilot|фордж\s+автопилот)(?=$|[\s:—-])/iu],
  ["deep.research", /^(?:\/research|@?deep\s+research|глубокое\s+исследование|проведи\s+глубокое\s+исследование)(?=$|[\s:—-])/iu],
  ["agent.team", /^(?:\/team|@?agent\s+team|команда\s+агентов)(?=$|[\s:—-])/iu],
  ["malik.verify", /^(?:\/verify|@?malik\s+verify|малик\s+проверь)(?=$|[\s:—-])/iu],
]
/** Explicit invocations coexist with the established semantic chat router.
 * Quoted examples and questions ABOUT a skill never start execution. */
export function skillInvocation(prompt: string, selected?: unknown): { skill: SkillId; prompt: string } | null {
  const explicit = skillDefinition(selected)
  if (explicit) return { skill: explicit.id, prompt: prompt.trim() }
  for (const [skill, pattern] of aliases) if (pattern.test(prompt)) return { skill, prompt: prompt.replace(pattern, "").replace(/^[\s:—-]+/u, "").trim() }
  return null
}
