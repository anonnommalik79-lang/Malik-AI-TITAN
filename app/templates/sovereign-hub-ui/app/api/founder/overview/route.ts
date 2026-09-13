import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import { getUsageOverview } from "@/lib/ai/usage"
import { getPersistedUsageOverview } from "@/lib/server/usage-persistence"
import { fetchWithTimeout, requestSafetySnapshot } from "@/lib/server/request-safety"

export const dynamic = "force-dynamic"

type WorkOSUser = {
  id?: string
  email?: string
  email_verified?: boolean
  created_at?: string
  updated_at?: string
  last_sign_in_at?: string | null
  first_name?: string | null
  last_name?: string | null
  name?: string | null
}

type WorkOSUsersPage = {
  data?: WorkOSUser[]
  list_metadata?: {
    before?: string | null
    after?: string | null
  }
}

const WORKOS_PAGE_SIZE = 100
const WORKOS_MAX_PAGES = 1_000
const DAY_MS = 24 * 60 * 60 * 1000
const ALMATY_OFFSET_MS = 6 * 60 * 60 * 1000

async function listAllWorkOSUsers(apiKey: string) {
  const users: WorkOSUser[] = []
  const seenCursors = new Set<string>()
  let after = ""

  // Walk the complete WorkOS directory. The large page guard only protects
  // against a broken cursor loop; no product-level "recent users" truncation is
  // applied, so yesterday/older registrations remain visible to the founder.
  for (let page = 0; page < WORKOS_MAX_PAGES; page += 1) {
    const url = new URL("https://api.workos.com/user_management/users")
    url.searchParams.set("limit", String(WORKOS_PAGE_SIZE))
    url.searchParams.set("order", "desc")
    if (after) url.searchParams.set("after", after)

    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }, 8_000)

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`WorkOS users ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`)
    }

    const payload = await response.json() as WorkOSUsersPage
    const pageUsers = Array.isArray(payload.data) ? payload.data : []
    users.push(...pageUsers)

    const next = String(payload.list_metadata?.after || "")
    if (!next || pageUsers.length === 0 || next === after || seenCursors.has(next)) break
    seenCursors.add(next)
    after = next
  }

  return users
}

function dateMs(value?: string | null) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function almatyDayNumber(value: number) {
  return Math.floor((value + ALMATY_OFFSET_MS) / DAY_MS)
}

function isAlmatyDay(value: number, daysAgo: number, now = Date.now()) {
  return value > 0 && almatyDayNumber(value) === almatyDayNumber(now) - daysAgo
}

function percent(value: number, total: number) {
  if (!total) return 0
  return Math.round((value / total) * 1000) / 10
}

export async function GET() {
  const { user } = await getOptionalWorkOSAuth()
  if (!isVerifiedOwner(user)) {
    return Response.json({ ok: false, error: "FOUNDER_ONLY" }, { status: 403 })
  }

  const usage = getUsageOverview()
  const persisted = getPersistedUsageOverview()
  const now = Date.now()

  let users: WorkOSUser[] = []
  let workosError = ""
  const apiKey = process.env.WORKOS_API_KEY?.trim() || ""

  if (apiKey) {
    try {
      users = await listAllWorkOSUsers(apiKey)
    } catch (error) {
      workosError = error instanceof Error ? error.message : "WorkOS users unavailable"
    }
  } else {
    workosError = "WORKOS_API_KEY is not configured"
  }

  const returningUsers = users.filter((entry) => {
    const created = dateMs(entry.created_at)
    const lastSignIn = dateMs(entry.last_sign_in_at)
    return created > 0 && lastSignIn - created >= 5 * 60 * 1000
  }).length

  const activeWithin = (windowMs: number) => users.filter((entry) => {
    const lastSignIn = dateMs(entry.last_sign_in_at)
    return lastSignIn > 0 && now - lastSignIn <= windowMs
  }).length

  const totalUsers = users.length || Math.max(usage.userCount, persisted.userCount)
  const verifiedUsers = users.filter((entry) => entry.email_verified === true).length
  const newUsers7d = users.filter((entry) => {
    const created = dateMs(entry.created_at)
    return created > 0 && now - created <= 7 * DAY_MS
  }).length
  const newUsersToday = users.filter((entry) => isAlmatyDay(dateMs(entry.created_at), 0, now)).length
  const newUsersYesterday = users.filter((entry) => isAlmatyDay(dateMs(entry.created_at), 1, now)).length
  const activeYesterday = users.filter((entry) => isAlmatyDay(dateMs(entry.last_sign_in_at), 1, now)).length
  const neverSignedIn = users.filter((entry) => !dateMs(entry.last_sign_in_at)).length

  // This is the complete WorkOS account list, never a rolling/recent-only list.
  // WorkOS is the durable source of truth for registrations; app deploys do not
  // clear yesterday or older users.
  const recentUsers = [...users]
    .sort((left, right) => dateMs(right.last_sign_in_at || right.created_at) - dateMs(left.last_sign_in_at || left.created_at))
    .map((entry) => {
      const createdAt = entry.created_at || null
      const lastSignInAt = entry.last_sign_in_at || null
      const created = dateMs(createdAt)
      const lastSignIn = dateMs(lastSignInAt)
      return {
        id: entry.id || "",
        email: entry.email || "",
        name: entry.name || [entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Пользователь",
        emailVerified: entry.email_verified === true,
        createdAt,
        lastSignInAt,
        activeToday: isAlmatyDay(lastSignIn, 0, now),
        activeYesterday: isAlmatyDay(lastSignIn, 1, now),
        registeredToday: isAlmatyDay(created, 0, now),
        registeredYesterday: isAlmatyDay(created, 1, now),
      }
    })

  const activeTodayUsers = recentUsers.filter((entry) => entry.activeToday)
  const yesterdayUsers = recentUsers.filter((entry) => entry.activeYesterday || entry.registeredYesterday)

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    metrics: {
      totalUsers,
      returningUsers,
      retentionRate: percent(returningUsers, totalUsers),
      verifiedUsers,
      newUsers7d,
      newUsersToday,
      newUsersYesterday,
      activeYesterday,
      neverSignedIn,
      dau: activeWithin(DAY_MS),
      wau: activeWithin(7 * DAY_MS),
      mau: activeWithin(30 * DAY_MS),
      runtimeActiveUsers: Math.max(usage.userCount, persisted.userCount),
      totalTokens: usage.tokensUsed,
      chatRequests: Math.max(usage.chatCount, persisted.chatCount),
      projectRequests: usage.projectCount,
      imageGenerations: Math.max(usage.imageCount, persisted.imageCount),
      videoGenerations: Math.max(usage.videoCount, persisted.videoCount),
      uploads: persisted.uploadCount,
    },
    runtimeSafety: {
      ...requestSafetySnapshot(),
      founderAuth: "server-verified",
      workosTimeoutMs: 8000,
      secretsExposed: false,
    },
    topUsage: usage.topUsers,
    recentUsers,
    activeTodayUsers,
    yesterdayUsers,
    scopes: {
      users: users.length ? "WorkOS AuthKit · complete registered account history (no app cleanup)" : "current Malik AI runtime fallback",
      tokenAndGenerationUsage: "current Render runtime / current UTC day",
    },
    warning: workosError || null,
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  })
}
