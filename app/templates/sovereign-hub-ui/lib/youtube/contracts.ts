export type Channel = {
  id: string; title: string; handle?: string; avatar?: string; description: string
  subscribers?: number; videoCount?: number; uploads?: string
}
export type YouTubeVideo = {
  id: string; sourceUrl: string; title: string; description: string; thumbnail?: string
  duration: number; publishedAt: string; channel: Channel
  views?: number; likes?: number; comments?: number; rating?: string
}
export type YouTubeComment = {
  id: string; parentId?: string; author: string; channelId?: string; avatar?: string
  text: string; publishedAt: string; updatedAt: string; likes?: number; viewerRating?: string; replyCount: number; own: boolean
}
export const videoIdValid = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id)
export const channelIdValid = (id: string) => /^UC[A-Za-z0-9_-]{22}$/.test(id)
export function shortsPath(value: string | null | undefined) {
  const path = value || "/shorts"
  return /^\/shorts(?:\/(?:youtube\/[A-Za-z0-9_-]{11}|channel\/UC[A-Za-z0-9_-]{22}|library|history))?(?:\?[A-Za-z0-9_%=&.-]*)?$/.test(path) ? path : "/shorts"
}
export const videoPath = (id: string) => videoIdValid(id) ? `/shorts/youtube/${id}` : "/shorts"
export function durationSeconds(value: string) {
  const m = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/)
  return m ? Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0) : 0
}
