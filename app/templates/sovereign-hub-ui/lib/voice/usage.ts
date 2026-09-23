type DailyVoiceUsage = { seconds: number; date: string }

const usage = new Map<string, DailyVoiceUsage>()

function dayKey() {
  return new Date().toISOString().slice(0, 10)
}

function limitSeconds() {
  const configured = Number(process.env.VOICE_DAILY_LIMIT_SECONDS || 120)
  return Number.isFinite(configured) && configured > 0 ? configured : 120
}

export function getVoiceUsage(userId: string, unlimited = false) {
  const date = dayKey()
  if (unlimited) {
    return {
      unlimited: true,
      usedSeconds: 0,
      limitSeconds: Number.MAX_SAFE_INTEGER,
      remainingSeconds: Number.MAX_SAFE_INTEGER,
      date,
    }
  }
  const key = `${userId}:${date}`
  const current = usage.get(key) || { seconds: 0, date }
  return {
    unlimited: false,
    usedSeconds: current.seconds,
    limitSeconds: limitSeconds(),
    remainingSeconds: Math.max(0, limitSeconds() - current.seconds),
    date,
  }
}

export function consumeVoiceUsage(userId: string, seconds: number, unlimited = false) {
  const safeSeconds = Math.max(0, Math.min(120, Number.isFinite(seconds) ? seconds : 0))
  const snapshot = getVoiceUsage(userId, unlimited)
  if (unlimited || safeSeconds <= 0) return { ok: true as const, ...snapshot }
  if (snapshot.usedSeconds + safeSeconds > snapshot.limitSeconds + .25) {
    return { ok: false as const, ...snapshot }
  }
  const next = snapshot.usedSeconds + safeSeconds
  usage.set(`${userId}:${snapshot.date}`, { seconds: next, date: snapshot.date })
  return {
    ok: true as const,
    usedSeconds: next,
    limitSeconds: snapshot.limitSeconds,
    remainingSeconds: Math.max(0, snapshot.limitSeconds - next),
    date: snapshot.date,
  }
}
