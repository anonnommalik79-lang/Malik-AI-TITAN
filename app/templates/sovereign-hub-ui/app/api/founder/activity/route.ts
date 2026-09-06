import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import { fetchWithTimeout } from "@/lib/server/request-safety"
import { founderMessageStorageMode, readFounderMessageLog, type FounderMessageEntry } from "@/lib/server/founder-message-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Every recent request, across every user, newest first.
 *
 * /api/founder/messages already returns one user's history, but it needs to be
 * told whose - which is only useful once you already know who to look at. The
 * founder page's actual question is the opposite one: who is using this right
 * now and what are they asking. So this route walks the accounts and merges
 * their logs into a single timeline.
 *
 * It reads the same encrypted log the per-user route reads and adds no new
 * storage: whatever /api/ai/chat and /api/voice/turn wrote is all there is.
 */

type WorkOSUser = {
  id?: string
  email?: string
  name?: string
  first_name?: string
  last_name?: string
  last_sign_in_at?: string | null
  created_at?: string | null
}

type ActivityRow = FounderMessageEntry & {
  userId: string
  userEmail: string
  userName: string
}

/** How many accounts are walked. Sorted by last sign-in, so this is "who is around". */
const MAX_ACCOUNTS = 60
/** Logs are read in waves rather than all at once, so object storage is not hit with 60 parallel gets. */
const WAVE = 8

function dateMs(value?: string | null) {
  const parsed = Date.parse(String(value || ""))
  return Number.isFinite(parsed) ? parsed : 0
}

async function fetchRecentAccounts(): Promise<WorkOSUser[]> {
  const apiKey = String(process.env.WORKOS_API_KEY || "").trim()
  if (!apiKey) throw new Error("WORKOS_API_KEY is not configured")

  const url = new URL("https://api.workos.com/user_management/users")
  url.searchParams.set("limit", String(Math.min(100, MAX_ACCOUNTS)))
  url.searchParams.set("order", "desc")

  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store",
  }, 8_000)

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`WorkOS users ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`)
  }

  const payload = await response.json().catch(() => ({})) as { data?: WorkOSUser[] }
  const users = Array.isArray(payload.data) ? payload.data : []
  return users
    .sort((left, right) => dateMs(right.last_sign_in_at || right.created_at) - dateMs(left.last_sign_in_at || left.created_at))
    .slice(0, MAX_ACCOUNTS)
}

/*
 * A log is stored under whatever string the request called the user, and that
 * string is not the same everywhere: the entitlement layer uses the email,
 * older writes used the WorkOS id. Both spellings are read and merged, exactly
 * as /api/founder/messages does, so history does not disappear because an
 * account was identified differently on a different day.
 */
async function readAllSpellings(user: WorkOSUser): Promise<FounderMessageEntry[]> {
  const keys = [...new Set([
    String(user.email || "").trim().toLowerCase(),
    user.id ? `workos:${user.id}`.toLowerCase() : "",
    String(user.id || "").trim().toLowerCase(),
  ].filter(Boolean))]

  const lists = await Promise.all(keys.map((key) => readFounderMessageLog(key).catch(() => [] as FounderMessageEntry[])))
  const seen = new Set<string>()
  return lists.flat().filter((entry) => {
    const key = `${entry.id}:${entry.createdAt}:${entry.source}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET(request: Request) {
  const { user } = await getOptionalWorkOSAuth()
  if (!isVerifiedOwner(user)) {
    return Response.json({ ok: false, error: "FOUNDER_ONLY" }, { status: 403 })
  }

  const url = new URL(request.url)
  const limit = Math.min(300, Math.max(10, Number(url.searchParams.get("limit")) || 80))
  const search = String(url.searchParams.get("q") || "").trim().toLowerCase()

  let accounts: WorkOSUser[] = []
  let warning = ""
  try {
    accounts = await fetchRecentAccounts()
  } catch (error) {
    warning = error instanceof Error ? error.message : "WorkOS users unavailable"
  }

  const rows: ActivityRow[] = []
  for (let index = 0; index < accounts.length; index += WAVE) {
    const wave = accounts.slice(index, index + WAVE)
    const results = await Promise.all(wave.map(async (account) => {
      const entries = await readAllSpellings(account)
      const name = account.name || [account.first_name, account.last_name].filter(Boolean).join(" ") || "Пользователь"
      return entries.map((entry) => ({
        ...entry,
        userId: account.id || "",
        userEmail: account.email || "",
        userName: name,
      }))
    }))
    for (const list of results) rows.push(...list)
  }

  const filtered = search
    ? rows.filter((row) => `${row.userName} ${row.userEmail} ${row.userText}`.toLowerCase().includes(search))
    : rows

  const items = filtered
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit)

  const day = 24 * 60 * 60 * 1000
  const now = Date.now()

  return Response.json({
    ok: true,
    items,
    total: rows.length,
    today: rows.filter((row) => now - dateMs(row.createdAt) <= day).length,
    accountsScanned: accounts.length,
    storage: founderMessageStorageMode(),
    warning: warning || null,
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
}
