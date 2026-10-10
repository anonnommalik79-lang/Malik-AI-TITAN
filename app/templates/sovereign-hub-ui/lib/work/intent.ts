import { detectScheduleIntent } from "@/lib/ai/schedule-intent"

export const WORK_REPOSITORY_MAX_GOAL_CHARS = 120_000

/** Only a direct request schedules Work. Examples, code and nested checklists are data. */
export function detectWorkScheduleIntent(prompt: string, timeZone = "UTC", now = Date.now()) {
  const opening = String(prompt || "").replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/).map(line => line.trim()).find(line => line && !/^[#>*]|^\d+[.)]/.test(line)) || ""
  const scope = opening.slice(0, 500).replace(/^(?:пожалуйста[, ]+|please\s+)/iu, "")
  // Scheduling instructions inside a technical mission do not schedule the mission itself.
  const direct = /^(?:напомни|напоминай|запланируй|поставь\s+напоминание|remind\s+me|schedule\b|notify\s+me\s+when|let\s+me\s+know\s+when|уведоми\s+.*когда|сообщи\s+.*когда|дай\s+знать\s+.*когда)/iu.test(scope)
  const recurring = /^(?:проверяй|отслеживай|мониторь|следи|присылай|отправляй|готовь|подготовь|check|monitor|watch|send\s+me|prepare)\s/iu.test(scope)
    && /кажд|ежеднев|по\s+расписанию|every\s|daily|weekly|завтра|tomorrow|через\s+\d|in\s+\d/iu.test(scope)
    && !/репозитор|github|исправ|рефактор|debug|refactor|patch|pull\s+request/iu.test(scope)
  const normalized = scope.replace(/через\s+час(?![\p{L}\p{N}])/iu, "через 1 час")
    .replace(/через\s+минуту(?![\p{L}\p{N}])/iu, "через 1 минуту")
    .replace(/(?<![\p{L}\p{N}])в\s+(\d{1,2}(?:[:.]\d{2})?)/iu, "at $1")
  return direct || recurring ? detectScheduleIntent(normalized, timeZone, now) : null
}

/** No guessed repository, private URL, quoted example or incidental GitHub mention. */
export function workRepositoryIntent(goal: string): { repo: string; ref?: string } | null {
  const text = String(goal || "").trim()
  if (!text || text.length > WORK_REPOSITORY_MAX_GOAL_CHARS) return null
  const directive = text.replace(/```[\s\S]*?```/g, "").split(/\r?\n/)
    .filter(line => !/^\s*>/.test(line)).join("\n")
  // A question about a repository is not permission to begin editing it.
  if (/^(?:что|как|почему|когда|кто|где|зачем|what|how|why|when|who|where|explain)(?![\p{L}\p{N}])/iu.test(directive.trim())) return null
  if (!/(?:изучи|прочитай|проверь|исправ|найди|работаем\s+в|работай\s+в|зайди|проанализируй|inspect|read|review|fix|debug|implement|working\s+in)/iu.test(directive.slice(0, 1500))) return null
  const matches = [...directive.matchAll(/https:\/\/github\.com\/([\w.-]{1,80})\/([\w.-]{1,100})(?:\/tree\/([\w.-]+))?(?=[/\s#?)]|$)/giu)]
  const named = directive.match(/(?:^|\n)\s*(?:репозиторий|repository)\s*:\s*([\w.-]{1,80}\/[\w.-]{1,100})\s*(?:\n|$)/iu)?.[1]
  const repos = [...new Set([...matches.map(match => `${match[1]}/${match[2].replace(/\.git$/i, "")}`), ...(named ? [named] : [])])]
  if (repos.length !== 1 || repos[0].split("/").some(part => part === "." || part === "..")) return null
  const branch = directive.match(/(?:^|\n)\s*(?:ветка|branch)\s*:\s*([\w./-]{1,120})/iu)?.[1]
  const urlRefs = [...new Set(matches.map(match => match[3]).filter((value): value is string => Boolean(value)))]
  // /tree/feature/topic may mean a slash-containing branch OR a directory in feature.
  // Never silently inspect a different commit. An explicit Branch line resolves that ambiguity.
  const ambiguousTree = matches.some(match => match[3] && /^\/[\w.-]/.test(directive.slice((match.index || 0) + match[0].length)))
  if (!branch && (ambiguousTree || urlRefs.length > 1)) return null
  return { repo: repos[0], ref: branch || urlRefs[0] }
}
