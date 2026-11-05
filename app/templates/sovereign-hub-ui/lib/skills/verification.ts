import { finalizeAccuracy } from "@/lib/ai/accuracy/engine"
import { buildClaimLedger } from "@/lib/ai/claim-ledger"
import { classifyFreshness } from "@/lib/ai/freshness-intent"
import { assessSources, currentEvidenceAvailable, safeEvidenceUrl } from "@/lib/live-intelligence/evidence"
import { projectFiles, sourceHash, validateSources } from "@/lib/website/engine/workspace"
import type { SkillCheck, SkillId, SkillOutput, SkillSource, SkillVerification } from "./types"

export function inspectSkillProject(project: NonNullable<SkillOutput["project"]>) {
  const files = projectFiles(project.files)
  if (!files.length) throw new Error("EMPTY_PROJECT")
  const analysis = validateSources(files)
  const errors = analysis.diagnostics.filter(d => d.severity === "error")
  return { sourceHash: sourceHash(files), errors: errors.map(d => `${d.file}:${d.line} ${d.code}`).slice(0, 30), checks: analysis.checks }
}
export function boundedSources(prompt: string, sources: SkillSource[]) {
  const seen = new Set<string>()
  const safe = sources.flatMap(source => {
    const url = safeEvidenceUrl(source.url)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{ ...source, url, title: source.title.slice(0, 300), snippet: source.snippet.slice(0, 7000), read: source.read === true }]
  }).slice(0, 12)
  const intent = classifyFreshness(prompt)
  const eligible = new Set(assessSources(prompt, safe.map(s => ({ ...s, domain: new URL(s.url).hostname })), intent)
    .filter(s => !intent.needsSearch || currentEvidenceAvailable([s], intent)).map(s => s.url))
  return safe.filter(s => eligible.has(s.url))
}
/** A deterministic gate, not a second model vote. Model review is separately
 * recorded; matching a citation only verifies provenance, not its truth. */
export function verifySkillResult(input: { skill: SkillId; prompt: string; target?: string; content: string; sources: SkillSource[]; project?: SkillOutput["project"]; execution?: SkillOutput["execution"] }) {
  const checks: SkillCheck[] = [], limits = ["Проверяется ограниченный набор явных утверждений; полнота и истинность всех фактов не гарантированы."]
  let content = input.content
  const prose = content.replace(/```[\s\S]*?(?:```|$)/gu, "")
  checks.push({ id: "nonempty", status: content.trim() ? "pass" : "fail", scope: "Результат существует", details: [] })
  const citations = [...prose.matchAll(/\[(\d{1,3})\](?!\()/gu)].map(m => Number(m[1]))
  const bad = citations.filter(n => n < 1 || n > input.sources.length)
  const actualUrls = new Set(input.sources.map(s => safeEvidenceUrl(s.url)))
  const invented = [...prose.matchAll(/https?:\/\/[^\s<>\])"']+/gu)].map(m => m[0].replace(/[.,;]+$/u, "")).filter(url => !actualUrls.has(safeEvidenceUrl(url)))
  checks.push({ id: "citation-provenance", status: bad.length || invented.length ? "fail" : "pass", scope: "Ссылки относятся к полученным источникам", details: [...bad.map(n => `UNKNOWN_CITATION:${n}`), ...invented.map(() => "UNOBSERVED_URL")].slice(0, 12) })
  const unsupportedAction = /(?:я|мы|I|we)\s+(?:успешно\s+)?(?:отправил[иа]?|опубликовал[иа]?|развернул[иа]?|задеплоил[иа]?|купил[иа]?|sent|published|deployed|purchased)(?!\p{L})/iu.test(prose)
    || ((!input.execution || input.execution.status !== "pass") && /(?:я|мы|I|we)\s+(?:успешно\s+)?(?:запустил[иа]?\s+(?:тест|сборк)|ran\s+(?:the\s+)?(?:tests|build))|(?:тесты|сборка)\s+(?:успешно\s+)?(?:пройдены|прошли|прошла)|(?:tests|build)\s+(?:have\s+)?passed/iu.test(prose))
  checks.push({ id: "action-receipts", status: unsupportedAction ? "fail" : "pass", scope: "Не заявлены действия без квитанций", details: unsupportedAction ? ["UNCONFIRMED_ACTION"] : [] })
  const accuracy = finalizeAccuracy(content, input.prompt, input.sources)
  content = accuracy.content
  checks.push({ id: "arithmetic", status: accuracy.report.issues.some(i => i.resolution === "unresolved") ? "fail" : "pass", scope: "Распознанные формулы, единицы и финансовые зависимости", details: accuracy.report.issues.map(i => `${i.code}:${i.resolution}:${i.detail}`).slice(0, 12) })
  if (input.skill === "malik.verify" && input.target) {
    const targetCheck = finalizeAccuracy(input.target, input.prompt, input.sources)
    const targetLedger = buildClaimLedger({ answer: input.target, prompt: input.prompt, sources: input.sources })
    const targetFacts = targetLedger?.claims.filter(c => c.origin === "external-fact" && !(targetCheck.report.checked > 0 && /^[\d\s.,()+\-*/×÷%^]+[=≈]\s*[-+\d.,/\s]+[.!]?$/u.test(c.text))) || []
    const unsupported = targetFacts.some(c => c.status === "UNVERIFIED" || c.status === "UNCERTAIN")
    checks.push({ id: "original-target", status: unsupported || !targetFacts.length && targetCheck.report.checked === 0 ? "not_run" : "pass", scope: "Проверяемость исходного ответа, независимо от рецензии модели", details: [`formulas:${targetCheck.report.checked}`, `external-claims:${targetFacts.length}`, ...(unsupported ? ["Не все исходные внешние утверждения подтверждены"] : [])] })
  }
  if (input.skill === "deep.research") {
    checks.push({ id: "research-sources", status: input.sources.length >= 2 && citations.length ? "pass" : "fail", scope: "Не менее двух источников и ссылки в тексте", details: [`sources:${input.sources.length}`, `citations:${citations.length}`] })
    checks.push({ id: "page-reading", status: input.sources.some(s => s.read) ? "pass" : "not_run", scope: "Прочитаны страницы, а не только поисковые сниппеты", details: [`read:${input.sources.filter(s => s.read).length}`] })
  }
  const freshness = classifyFreshness(input.prompt)
  if (freshness.needsSearch) {
    const assessed = assessSources(input.prompt, input.sources.map(s => ({ ...s, domain: new URL(s.url).hostname })), freshness)
    const eligible = new Set(assessed.filter(s => currentEvidenceAvailable([s], freshness)).map(s => s.url))
    checks.push({ id: "freshness", status: currentEvidenceAvailable(assessed, freshness) && citations.every(n => eligible.has(input.sources[n - 1]?.url)) ? "pass" : "not_run", scope: "Доступность актуальных подтверждений", details: ["Дата публикации не равна гарантии текущего состояния"] })
  }
  const ledger = buildClaimLedger({ answer: content, prompt: input.prompt, sources: input.sources })
  const external = ledger?.claims.filter(c => c.origin === "external-fact") || []
  // Forge's final text is server-authored from the file/test receipts. Its
  // file count is a tool observation, not an external fact needing the web.
  if (external.length && input.skill !== "forge.autopilot") checks.push({ id: "external-facts", status: external.some(c => c.status === "UNVERIFIED" || c.status === "UNCERTAIN") ? "not_run" : "pass", scope: "Ограниченная сверка явных фактов с текстом источников", details: [`recognized:${external.length}`, "Совпадение текста/числа не доказывает факт целиком"] })
  if (input.project) {
    try {
      const qa = inspectSkillProject(input.project)
      checks.push({ id: "source-static", status: qa.errors.length ? "fail" : "pass", scope: "Статическая проверка файлов", details: qa.errors })
      const run = input.execution
      const matches = run?.sourceHash === qa.sourceHash
      checks.push({ id: "runtime-tests", status: matches && run ? run.status === "pass" ? "pass" : run.status === "fail" ? "fail" : "not_run" : "not_run", scope: "Реальный запуск точно этих исходников", details: run?.details || ["Сборка и тесты не запускались"] })
    } catch { checks.push({ id: "source-static", status: "fail", scope: "Безопасность файлов", details: ["INVALID_PROJECT_FILES"] }) }
    limits.push("Статический QA не заменяет runtime, браузерную проверку и аудит безопасности человеком.")
  }
  const status: SkillVerification["status"] = checks.some(c => c.status === "fail") ? "fail" : checks.some(c => c.status === "not_run") ? "partial" : "pass"
  return { content, verification: { status, checks, limits } }
}
