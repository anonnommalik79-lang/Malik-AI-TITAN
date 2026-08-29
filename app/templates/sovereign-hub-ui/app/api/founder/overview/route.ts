import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import { getUsageOverview } from "@/lib/ai/usage"
import { getPersistedUsageOverview } from "@/lib/server/usage-persistence"

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

async function listAllWorkOSUsers(apiKey: string) {
  const users: WorkOSUser[] = []
  let after = ""

  // Hard cap protects the founder page from accidental endless pagination while
  // still supporting up to 5,000 registered users without changing the UI.
  for (let page = 0; page < 50; page += 1) {
    const url = new URL("https://api.workos.com/user_management/users")
    url.searchParams.set("limit", "100")
    url.searchParams.set("order", "desc")
    if (after) url.searchParams.set("after", after)

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`WorkOS users ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`)
    }

    const payload = await response.json() as WorkOSUsersPage
    const pageUsers = Array.isArray(payload.data) ? payload.data : []
    users.push(...pageUsers)

    const next = String(payload.list_metadata?.after || "")
    if (!next || pageUsers.length === 0 || next === after) break
    after = next
  }

  return users
}

function dateMs(value?: string | null) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
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
  const day = 24 * 60 * 60 * 1000

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
    // A sign-in meaningfully after account creation is treated as a return.
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
    return created > 0 && now - created <= 7 * day
  }).length

  const recentUsers = [...users]
    .sort((left, right) => dateMs(right.last_sign_in_at || right.created_at) - dateMs(left.last_sign_in_at || left.created_at))
    .slice(0, 12)
    .map((entry) => ({
      id: entry.id || "",
      email: entry.email || "",
      name: entry.name || [entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Пользователь",
      emailVerified: entry.email_verified === true,
      createdAt: entry.created_at || null,
      lastSignInAt: entry.last_sign_in_at || null,
    }))

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    metrics: {
      totalUsers,
      returningUsers,
      retentionRate: percent(returningUsers, totalUsers),
      verifiedUsers,
      newUsers7d,
      dau: activeWithin(day),
      wau: activeWithin(7 * day),
      mau: activeWithin(30 * day),
      runtimeActiveUsers: Math.max(usage.userCount, persisted.userCount),
      totalTokens: usage.tokensUsed,
      chatRequests: Math.max(usage.chatCount, persisted.chatCount),
      projectRequests: usage.projectCount,
      imageGenerations: Math.max(usage.imageCount, persisted.imageCount),
      videoGenerations: Math.max(usage.videoCount, persisted.videoCount),
      uploads: persisted.uploadCount,
    },
    topUsage: usage.topUsers,
    recentUsers,
    scopes: {
      users: users.length ? "WorkOS AuthKit" : "current Malik AI runtime fallback",
      tokenAndGenerationUsage: "current Render runtime / current UTC day",
    },
    warning: workosError || null,
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  })
}
