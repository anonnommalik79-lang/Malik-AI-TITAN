import type { MalikSchedule } from "@/lib/server/scheduled-tasks"

export type MalikScheduleIntent = {
  schedule: MalikSchedule
  mode: "task" | "condition"
  title: string
}

const RU_WEEKDAYS: Record<string, number> = {
  воскресенье: 0, воскресеньям: 0,
  понедельник: 1, понедельникам: 1,
  вторник: 2, вторникам: 2,
  среду: 3, средам: 3, среда: 3,
  четверг: 4, четвергам: 4,
  пятницу: 5, пятницам: 5, пятница: 5,
  субботу: 6, субботам: 6, суббота: 6,
}
const EN_WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

function clockFromPrompt(prompt: string, fallback = "09:00") {
  const numeric = prompt.match(/(?:\bв\b|\bat\b)\s*([01]?\d|2[0-3])(?:[:.]([0-5]\d))?/iu)
  if (numeric) return String(Number(numeric[1])).padStart(2, "0") + ":" + (numeric[2] || "00")
  if (/утром|morning/iu.test(prompt)) return "08:00"
  if (/дн[её]м|afternoon/iu.test(prompt)) return "15:00"
  if (/вечером|evening/iu.test(prompt)) return "19:00"
  return fallback
}

function relativeMs(amount: number, unit: string) {
  if (/мин|minute/iu.test(unit)) return amount * 60_000
  if (/час|hour/iu.test(unit)) return amount * 60 * 60_000
  if (/дн|день|дня|day/iu.test(unit)) return amount * 24 * 60 * 60_000
  if (/нед|week/iu.test(unit)) return amount * 7 * 24 * 60 * 60_000
  return 0
}

function shortTitle(prompt: string) {
  return prompt.replace(/\s+/g, " ").trim().slice(0, 72) || "Malik task"
}

function localDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>
}

export function detectScheduleIntent(promptValue: string, timeZoneValue = "UTC", nowMs = Date.now()): MalikScheduleIntent | null {
  const prompt = String(promptValue || "").replace(/\s+/g, " ").trim()
  if (!prompt) return null
  const lower = prompt.toLowerCase()
  const timeZone = String(timeZoneValue || "UTC").trim() || "UTC"
  const mode: "task" | "condition" = /(следи|отслеж|монитор|уведоми|сообщи.*когда|когда.*сообщ|когда.*уведом|дай\s+знать.*когда|напомни.*когда|notify.*when|when.*notify|let\s+me\s+know.*when|tell\s+me.*when|monitor|watch\s+for)/iu.test(lower)
    ? "condition"
    : "task"

  const relative = lower.match(/(?:через|in)\s+(\d{1,4})\s*(минут[уы]?|мин|minutes?|час(?:а|ов)?|hours?|д(?:ень|ня|ней)|days?|недел[юьи]|weeks?)/iu)
  if (relative) {
    const amount = Number(relative[1])
    const delta = relativeMs(amount, relative[2])
    if (delta > 0) {
      return {
        schedule: { kind: "once", runAt: new Date(nowMs + delta).toISOString() },
        mode,
        title: shortTitle(prompt),
      }
    }
  }

  if (/(?:завтра|tomorrow)/iu.test(lower)) {
    const clock = clockFromPrompt(lower, "09:00")
    const tomorrow = new Date(nowMs + 24 * 60 * 60_000)
    const localTomorrow = localDateParts(tomorrow, timeZone)
    const [hour, minute] = clock.split(":").map(Number)
    for (let offset = -18 * 60; offset <= 18 * 60; offset += 15) {
      const utc = Date.UTC(Number(localTomorrow.year), Number(localTomorrow.month) - 1, Number(localTomorrow.day), hour, minute) - offset * 60_000
      const candidate = new Date(utc)
      const parts = localDateParts(candidate, timeZone)
      const sameDate = parts.year === localTomorrow.year && parts.month === localTomorrow.month && parts.day === localTomorrow.day
      const sameTime = parts.hour + ":" + parts.minute === clock
      if (sameDate && sameTime && candidate.getTime() > nowMs) {
        return { schedule: { kind: "once", runAt: candidate.toISOString() }, mode, title: shortTitle(prompt) }
      }
    }
  }

  const everyAmount = lower.match(/(?:каждые?|every)\s+(\d{1,3})\s*(минут[уы]?|мин|minutes?|час(?:а|ов)?|hours?|дн(?:я|ей)?|days?)/iu)
  if (everyAmount) {
    const amount = Number(everyAmount[1])
    const minutes = Math.round(relativeMs(amount, everyAmount[2]) / 60_000)
    if (minutes >= 5) return { schedule: { kind: "interval", everyMinutes: minutes }, mode, title: shortTitle(prompt) }
  }

  if (/каждый\s+час|every\s+hour/iu.test(lower)) {
    return { schedule: { kind: "interval", everyMinutes: 60 }, mode, title: shortTitle(prompt) }
  }

  const weekdayMatch = lower.match(/(?:кажд(?:ый|ую)\s+|каждую\s+неделю(?:\s+в)?\s*|every\s+)(воскресенье|воскресеньям|понедельник|понедельникам|вторник|вторникам|среду|средам|среда|четверг|четвергам|пятницу|пятницам|пятница|субботу|субботам|суббота|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/iu)
  if (weekdayMatch) {
    const key = weekdayMatch[1].toLowerCase()
    const dayOfWeek = RU_WEEKDAYS[key] ?? EN_WEEKDAYS[key]
    if (dayOfWeek !== undefined) {
      return {
        schedule: { kind: "weekly", dayOfWeek, time: clockFromPrompt(lower), timeZone },
        mode,
        title: shortTitle(prompt),
      }
    }
  }

  if (/каждый\s+день|ежедневн|every\s+day|daily/iu.test(lower)) {
    return {
      schedule: { kind: "daily", time: clockFromPrompt(lower), timeZone },
      mode,
      title: shortTitle(prompt),
    }
  }

  if (mode === "condition") {
    return {
      schedule: { kind: "interval", everyMinutes: 60 },
      mode: "condition",
      title: shortTitle(prompt),
    }
  }

  return null
}
