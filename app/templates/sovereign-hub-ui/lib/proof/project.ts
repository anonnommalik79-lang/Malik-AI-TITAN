import { buildPassport, type ProofPassport } from "./passport"

/** Static QA and a model opinion are not a build or an execution receipt. */
export function projectPassport(input: {
  projectId: string; title: string; files: Array<{ path: string; content: string }>
  qa?: { passed: boolean; checks: string[]; issues: string[]; staticIssues?: string[]; reviewer?: string; reviewStatus?: "pass" | "fail" | "not_run" }
  now?: Date
}): ProofPassport {
  const qa = input.qa
  const staticRan = Boolean(qa && (qa.checks.length || qa.issues.length))
  const reviewStatus = qa?.reviewStatus ?? (qa?.reviewer ? (/^PASS\b/i.test(qa.reviewer) ? "pass" : "fail") : "not_run")
  return buildPassport({
    projectId: input.projectId, title: input.title, kind: "project",
    checks: [
      { id: "static", kind: "static", label: "Структура, синтаксис и импорты", required: true,
        status: !staticRan ? "not_run" : (qa!.staticIssues ?? qa!.issues).length ? "fail" : "pass",
        command: "validateProject + analyzeProject (no code execution)", details: qa?.checks || [] },
      { id: "review", kind: "review", label: "Модельное ревью (не запуск кода)", required: true,
        status: reviewStatus, command: "Project QA model review", details: reviewStatus === "not_run" ? ["Ревью недоступно или не запускалось"] : [qa?.reviewer || ""] },
      { id: "build", kind: "build", label: "Установка зависимостей и сборка", status: "not_run", required: true, details: ["Не выполняется в веб-процессе; нужен изолированный внешний исполнитель"] },
      { id: "unit", kind: "unit", label: "Тесты проекта", status: "not_run", required: true, details: [] },
      { id: "browser", kind: "browser", label: "Браузер desktop/mobile", status: "not_run", required: true, details: [] },
    ],
    knownIssues: qa?.issues || [],
    blindSpots: ["Статические проверки и мнение модели не доказывают работоспособность или безопасность"],
    artifacts: input.files.slice(0, 20).map(file => ({ name: file.path, bytes: new TextEncoder().encode(file.content).length })),
    now: input.now,
  })
}
