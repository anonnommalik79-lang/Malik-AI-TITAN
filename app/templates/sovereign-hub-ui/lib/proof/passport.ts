/**
 * Malik Proof Passport — the record of what was actually checked about a
 * generated project, and nothing more.
 *
 * Every studio that produces software (Game Studio, Site Forge, the project
 * builder, Self-Build, World Engine) reports its checks here. The status is
 * computed from the checks, never written by hand:
 *
 *   PASS        every required check ran and passed;
 *   FAIL        a required check ran and failed;
 *   PARTIAL     nothing required failed, but something required did not run,
 *               or an optional check failed;
 *   NOT_TESTED  no check ran at all.
 *
 * A check that did not run is `not_run` and is listed under «not verified»,
 * so the person can see the difference between «checked and fine» and
 * «nobody looked». Pure and isomorphic: the server builds it, the chat shows
 * it, it is stored inside the artifact, the tests check the rules.
 */

export const PASSPORT_VERSION = "malik-proof-passport/1"

export type PassportStatus = "PASS" | "PARTIAL" | "FAIL" | "NOT_TESTED"
export type CheckStatus = "pass" | "fail" | "not_run"
export type CheckKind = "static" | "build" | "unit" | "integration" | "runtime" | "browser" | "review"

export type PassportCheck = {
  id: string
  kind: CheckKind
  label: string
  status: CheckStatus
  /** Required checks decide PASS/FAIL; optional ones can only lower PASS to PARTIAL. */
  required: boolean
  /** The command or procedure that really ran (shown verbatim). */
  command?: string
  ranAt?: string
  durationMs?: number
  details: string[]
}

export type PassportArtifact = { name: string; bytes?: number; sha256?: string }

export type ProofPassport = {
  version: typeof PASSPORT_VERSION
  projectId: string
  projectVersion: number
  kind: "game" | "site" | "project" | "selfbuild" | "world" | "oil"
  title: string
  createdAt: string
  /** When the first real check ran; null when none did. */
  testedAt: string | null
  /** Commands of checks that really ran, in order. */
  commands: string[]
  checks: PassportCheck[]
  knownIssues: string[]
  /** What nobody verified (checks that did not run, plus declared blind spots). */
  untested: string[]
  artifacts: PassportArtifact[]
  /** Content binding, not a signature or a security certification. */
  sourceHash?: string
  logs: string[]
  status: PassportStatus
}

export function passportStatus(checks: readonly PassportCheck[]): PassportStatus {
  const ran = checks.filter((check) => check.status !== "not_run")
  if (!ran.length) return "NOT_TESTED"
  const required = checks.filter((check) => check.required)
  if (required.some((check) => check.status === "fail")) return "FAIL"
  const requiredMissing = required.some((check) => check.status === "not_run")
  const optionalFailed = checks.some((check) => !check.required && check.status === "fail")
  if (requiredMissing || optionalFailed || !required.length) return "PARTIAL"
  return "PASS"
}

const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, max)

/** A passport from the checks a studio really ran. Status and the «not verified» list are derived. */
export function buildPassport(input: {
  projectId: string
  projectVersion?: number
  kind: ProofPassport["kind"]
  title: string
  checks: PassportCheck[]
  knownIssues?: string[]
  blindSpots?: string[]
  artifacts?: PassportArtifact[]
  logs?: string[]
  sourceHash?: string
  now?: Date
}): ProofPassport {
  const now = (input.now || new Date()).toISOString()
  const checks = input.checks.slice(0, 40).map((check) => ({
    ...check,
    label: clip(check.label, 120),
    details: (check.details || []).map((line) => clip(line, 400)).filter(Boolean).slice(0, 12),
    ...(check.status === "not_run" ? { ranAt: undefined, durationMs: undefined } : { ranAt: check.ranAt || now }),
  }))
  const ran = checks.filter((check) => check.status !== "not_run")
  const testedAt = ran.length ? ran.map((check) => check.ranAt as string).sort()[0] : null
  const untested = [
    ...checks.filter((check) => check.status === "not_run").map((check) => check.label),
    ...(input.blindSpots || []).map((line) => clip(line, 200)),
  ]
  return {
    version: PASSPORT_VERSION,
    projectId: clip(input.projectId, 80) || "project",
    projectVersion: Math.max(1, Math.floor(Number(input.projectVersion) || 1)),
    kind: input.kind,
    title: clip(input.title, 120),
    createdAt: now,
    testedAt,
    commands: ran.map((check) => check.command).filter((command): command is string => Boolean(command)).map((command) => clip(command, 300)),
    checks,
    knownIssues: (input.knownIssues || []).map((line) => clip(line, 300)).filter(Boolean).slice(0, 20),
    untested: [...new Set(untested)].slice(0, 20),
    artifacts: (input.artifacts || []).slice(0, 20),
    ...(/^[a-f0-9]{64}$/.test(input.sourceHash || "") ? { sourceHash: input.sourceHash } : {}),
    logs: (input.logs || []).map((line) => clip(line, 600)).slice(0, 30),
    status: passportStatus(checks),
  }
}

/** Reads a stored passport back, or null — a passport that does not parse is not evidence. */
export function readPassport(value: unknown): ProofPassport | null {
  const data = typeof value === "string" ? (() => { try { return JSON.parse(value) } catch { return null } })() : value
  if (!data || typeof data !== "object" || (data as ProofPassport).version !== PASSPORT_VERSION || !Array.isArray((data as ProofPassport).checks)) return null
  const passport = data as ProofPassport
  if (passport.checks.length > 40 || !["game", "site", "project", "selfbuild", "world", "oil"].includes(passport.kind)
    || typeof passport.projectId !== "string" || typeof passport.title !== "string"
    || !Number.isFinite(Date.parse(passport.createdAt))
    || passport.checks.some(check => !check || typeof check !== "object"
      || !["pass", "fail", "not_run"].includes(check.status)
      || !["static", "build", "unit", "integration", "runtime", "browser", "review"].includes(check.kind)
      || typeof check.id !== "string" || typeof check.label !== "string" || typeof check.required !== "boolean"
      || !Array.isArray(check.details) || check.details.some(detail => typeof detail !== "string")
      || (check.status !== "not_run" && (!check.ranAt || !Number.isFinite(Date.parse(check.ranAt)))))) return null
  // Rebuild all derived evidence, not only the top-level verdict. This is
  // structural validation, NOT authentication of a client-provided receipt.
  return buildPassport({
    ...passport, blindSpots: Array.isArray(passport.untested) ? passport.untested : [],
    knownIssues: Array.isArray(passport.knownIssues) ? passport.knownIssues : [],
    artifacts: Array.isArray(passport.artifacts) ? passport.artifacts : [],
    logs: Array.isArray(passport.logs) ? passport.logs : [], now: new Date(passport.createdAt),
  })
}

type Locale = "ru" | "kk" | "en"
const WORDS: Record<Locale, { title: string; project: string; version: string; tested: string; never: string; check: string; result: string; issues: string; untested: string; commands: string; status: Record<PassportStatus, string>; mark: Record<CheckStatus, string>; kind: Record<CheckKind, string> }> = {
  ru: {
    title: "Паспорт проверок", project: "Проект", version: "версия", tested: "Проверки запускались", never: "проверки не запускались", check: "Проверка", result: "Итог", issues: "Известные проблемы", untested: "Не проверено", commands: "Команды",
    status: { PASS: "PASS — все обязательные проверки пройдены", PARTIAL: "PARTIAL — часть обязательного не проверена или есть некритичные ошибки", FAIL: "FAIL — обязательная проверка не пройдена", NOT_TESTED: "NOT_TESTED — ни одна проверка не запускалась" },
    mark: { pass: "✅ пройдена", fail: "❌ не пройдена", not_run: "⏸ не запускалась" },
    kind: { static: "статическая", build: "сборка", unit: "unit", integration: "интеграционная", runtime: "запуск", browser: "браузер", review: "ревью" },
  },
  kk: {
    title: "Тексеру паспорты", project: "Жоба", version: "нұсқа", tested: "Тексерулер іске қосылды", never: "тексерулер іске қосылмады", check: "Тексеру", result: "Нәтиже", issues: "Белгілі мәселелер", untested: "Тексерілмеген", commands: "Командалар",
    status: { PASS: "PASS — барлық міндетті тексеру өтті", PARTIAL: "PARTIAL — міндеттінің бір бөлігі тексерілмеді", FAIL: "FAIL — міндетті тексеру өтпеді", NOT_TESTED: "NOT_TESTED — бірде-бір тексеру іске қосылмады" },
    mark: { pass: "✅ өтті", fail: "❌ өтпеді", not_run: "⏸ іске қосылмады" },
    kind: { static: "статикалық", build: "құрастыру", unit: "unit", integration: "интеграциялық", runtime: "іске қосу", browser: "браузер", review: "шолу" },
  },
  en: {
    title: "Proof passport", project: "Project", version: "version", tested: "Checks ran at", never: "no check ran", check: "Check", result: "Result", issues: "Known issues", untested: "Not verified", commands: "Commands",
    status: { PASS: "PASS — every required check passed", PARTIAL: "PARTIAL — something required was not checked or a non-blocking check failed", FAIL: "FAIL — a required check failed", NOT_TESTED: "NOT_TESTED — no check ran" },
    mark: { pass: "✅ passed", fail: "❌ failed", not_run: "⏸ not run" },
    kind: { static: "static", build: "build", unit: "unit", integration: "integration", runtime: "run", browser: "browser", review: "review" },
  },
}

const cell = (value: string) => value.replace(/\|/gu, "\\|").replace(/\n/gu, " ")

/** The passport as a compact Markdown section for the chat answer. */
export function passportMarkdown(passport: ProofPassport, locale: Locale = "ru") {
  const w = WORDS[locale] || WORDS.en
  const when = passport.testedAt ? `${w.tested}: ${passport.testedAt.replace("T", " ").slice(0, 16)} UTC` : w.never
  const rows = passport.checks.map((check) => `| ${cell(check.label)} | ${w.kind[check.kind]} | ${w.mark[check.status]} | ${cell(check.details[0] || (check.command ? `\`${check.command}\`` : ""))} |`)
  return [
    `**${w.title}** · \`${passport.status}\``,
    "",
    `${w.project}: ${cell(passport.title)} · \`${passport.projectId}\` · ${w.version} ${passport.projectVersion} · ${when}`,
    "",
    `${w.result}: ${w.status[passport.status]}`,
    "",
    `| ${w.check} | | | |`,
    "|---|---|---|---|",
    ...rows,
    ...(passport.knownIssues.length ? ["", `**${w.issues}:**`, ...passport.knownIssues.slice(0, 6).map((line) => `- ${line}`)] : []),
    ...(passport.untested.length ? ["", `**${w.untested}:** ${passport.untested.slice(0, 8).join("; ")}.`] : []),
  ].join("\n")
}

/** JSON safe to place inside <script type="application/json"> in an HTML artifact. */
export function passportScriptJson(passport: ProofPassport) {
  return JSON.stringify(passport).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026")
}
