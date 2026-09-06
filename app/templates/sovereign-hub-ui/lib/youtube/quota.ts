import "server-only"
import { db } from "./store"
import { YouTubeError } from "./errors"
/** Shared, atomic fixed windows. Survives multiple Render instances and restarts. */
export async function limit(user: string, kind: "read" | "write" | "search" | "connect") {
  const maximum = { read: 180, write: 30, search: 6, connect: 5 }[kind]
  const allowed = await db<boolean>("rpc/youtube_take_budget", { method: "POST", body: JSON.stringify({ p_key: `${user}:${kind}`, p_limit: maximum, p_seconds: 60 }) })
  if (!allowed) throw new YouTubeError("rateLimitExceeded", 429)
  if (kind === "search") {
    const daily = await db<boolean>("rpc/youtube_take_budget", { method: "POST", body: JSON.stringify({ p_key: `${user}:search:daily`, p_limit: 30, p_seconds: 86400 }) })
    if (!daily) throw new YouTubeError("dailyLimitExceeded", 429)
  }
}
