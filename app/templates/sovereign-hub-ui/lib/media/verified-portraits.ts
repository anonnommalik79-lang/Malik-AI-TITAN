/** A verified portrait, with a small same-origin reserve for catalogue/CDN outages. */
export const ELON_MUSK_PORTRAIT = {
  url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Elon_Musk_-_54820081119_%28cropped%29.jpg/500px-Elon_Musk_-_54820081119_%28cropped%29.jpg",
  fallbackUrl: "/reference-photos/elon-musk.jpg",
  alt: "Elon Musk",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Elon_Musk_-_54820081119_(cropped).jpg",
  credit: "Gage Skidmore · Wikimedia Commons",
  license: "CC BY-SA 4.0",
}

/** Exact aliases only: a namesake, company, airport or statue never matches. */
export function canonicalPortraitTopic(topic: string): string {
  const name = topic.replace(/[,_]/gu, " ").replace(/\s+/gu, " ").trim()
  if (/^(?:(?:илон[ауе]?|elon)(?:\s+(?:рив[ауе]?|reeve))?\s+(?:маск[ауе]?|musk)|маск\s+илон)$/iu.test(name)) return "Elon Musk"
  return topic
}

export function verifiedPortrait(topic: string) {
  return canonicalPortraitTopic(topic) === "Elon Musk" ? ELON_MUSK_PORTRAIT : null
}
