import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { canReadFounderHistory } from "@/lib/server/founder-history-access"
import { founderMessageStorageMode, founderMessageStorageWarning, readFounderMessageLog, type FounderMessageEntry } from "@/lib/server/founder-message-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function unique(values: string[]) {
  return [...new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))]
}

export async function GET(request: Request) {
  const { user } = await getOptionalWorkOSAuth()
  if (!canReadFounderHistory(user)) {
    return Response.json({ ok: false, error: "FOUNDER_VERIFIED_ACCOUNT_REQUIRED" }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
  }

  const url = new URL(request.url)
  const id = String(url.searchParams.get("id") || "").trim()
  const email = String(url.searchParams.get("email") || "").trim().toLowerCase()
  if (!id && !email) {
    return Response.json({ ok: false, error: "USER_REQUIRED" }, { status: 400 })
  }

  const candidates = unique([
    email,
    id ? `workos:${id}` : "",
    id,
  ])

  const all: FounderMessageEntry[] = []
  try {
    const lists = await Promise.all(candidates.map(candidate => readFounderMessageLog(candidate)))
    all.push(...lists.flat())
  } catch {
    return Response.json({ ok: false, error: "HISTORY_STORAGE_READ_FAILED", message: "Не удалось прочитать журнал. Это не означает, что сообщений нет." }, { status: 503, headers: { "Cache-Control": "private, no-store" } })
  }

  const seen = new Set<string>()
  const entries = all
    .filter((entry) => {
      const key = `${entry.id}:${entry.createdAt}:${entry.source}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))

  return Response.json({
    ok: true,
    entries,
    count: entries.length,
    storage: founderMessageStorageMode(),
    storageWarning: founderMessageStorageWarning(),
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
}
