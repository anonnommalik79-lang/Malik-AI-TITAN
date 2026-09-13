import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import { fetchWithTimeout } from "@/lib/server/request-safety"
import { founderMessageStorageMode, readFounderMessageLog, type FounderMessageEntry } from "@/lib/server/founder-message-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type WorkOSUser = {
  id?: string
  email?: string
  name?: string
  first_name?: string
  last_name?: string
  last_sign_in_at?: string | null
  created_at?: string | null
}

type WorkOSUsersPage = {
  data?: WorkOSUser[]
  list_metadata?: { after?: string | null }
}

type ActivityRow = FounderMessageEntry & {
  userId: string
  userEmail: string
  userName: string
}

const WAVE = 8
const WORKOS_PAGE_SIZE = 100
const WORKOS_MAX_PAGES = 1_000
const DAY_MS = 24 * 60 * 60 * 1000
const ALMATY_OFFSET_MS = 6 * 60 * 60 * 1000

function dateMs(value?: string | null) {
  const parsed = Date.parse(String(value || ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function almatyDayNumber(value: number) {
  return Math.floor((value + ALMATY_OFFSET_MS) / DAY_MS)
}

function isAlmatyDay(value: number, daysAgo: number, now = Date.now()) {
  return value > 0 && almatyDayNumber(value) === almatyDayNumber(now) - daysAgo
}

async function fetchAllAccounts(): Promise<WorkOSUser[]> {
  const apiKey = String(process.env.WORKOS_API_KEY || "").trim()
  if (!apiKey) throw new Error("WORKOS_API_KEY is not configured")

  const accounts: WorkOSUser[] = []
  const seenCursors = new Set<string>()
  let after = ""

  for (let page = 0; page < WORKOS_MAX_PAGES; page += 1) {
    const url = new URL("https://api.workos.com/user_management/users")
    url.searchParams.set("limit", String(WORKOS_PAGE_SIZE))
    url.searchParams.set("order", "desc")
    if (after) url.searchParams.set("after", after)

    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    }, 8_000)

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`WorkOS users ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`)
    }

    const payload = await response.json().catch(() => ({})) as WorkOSUsersPage
    const pageUsers = Array.isArray(payload.data) ? payload.data : []
    accounts.push(...pageUsers)

    const next = String(payload.list_metadata?.after || "")
    if (!next || pageUsers.length === 0 || next === after || seenCursors.has(next)) break
    seenCursors.add(next)
    after = next
  }

  return accounts.sort((left, right) => dateMs(right.last_sign_in_at || right.created_at) - dateMs(left.last_sign_in_at || left.created_at))
}

/*
 * A log can exist under the email, the prefixed WorkOS id, or the raw WorkOS id
 * depending on which route originally wrote it. Merge every spelling so older
 * requests never disappear merely because identification changed later.
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
  const search = String(url.searchParams.get("q") || "").trim().toLowerCase()

  let accounts: WorkOSUser[] = []
  let warning = ""
  try {
    accounts = await fetchAllAccounts()
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

  // Founder asked for the complete timeline. Do not cut the response to the
  // old 120/300-row window; sorting is the only transformation here.
  const items = filtered.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  const now = Date.now()

  return Response.json({
    ok: true,
    items,
    total: rows.length,
    today: rows.filter((row) => isAlmatyDay(dateMs(row.createdAt), 0, now)).length,
    yesterday: rows.filter((row) => isAlmatyDay(dateMs(row.createdAt), 1, now)).length,
    accountsScanned: accounts.length,
    storage: founderMessageStorageMode(),
    warning: warning || null,
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
}
