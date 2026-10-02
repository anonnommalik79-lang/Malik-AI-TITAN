/** Verified publisher assets, loaded directly in the browser only when named. */
const ENTITIES = {
  metricool: { name: "Metricool", href: "https://metricool.com/", icon: "https://metricool.com/wp-content/uploads/cropped-web-app-manifest-512x512-1-192x192.png" },
  canva: { name: "Canva", href: "https://www.canva.com/", icon: "https://static.canva.com/static/images/favicon.ico" },
} as const

export function parseAnswerEntity(text: string) {
  const match = /^\s*(?:\*\*|__)?(Metricool|Canva)(?:\*\*|__)?(?:\s*[:—–-]\s*|\s*\n\s*|\s*$)([\s\S]*)$/iu.exec(text)
  if (!match) return null
  return { ...ENTITIES[match[1].toLowerCase() as keyof typeof ENTITIES], description: match[2].trim() }
}
