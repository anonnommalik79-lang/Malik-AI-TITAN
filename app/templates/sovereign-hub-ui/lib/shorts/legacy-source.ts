import "server-only"
import { shortsSupabaseRequest } from "./server"
/** Legacy Malik/TikTok writes must never masquerade as YouTube actions. */
export async function isYouTubePost(postId: string) {
  const rows = await shortsSupabaseRequest<Array<{ source: string }>>(`malik_shorts_posts?id=eq.${encodeURIComponent(postId)}&select=source&limit=1`)
  if (!rows.length) throw new Error("SHORT_NOT_FOUND")
  return rows[0].source === "youtube"
}
