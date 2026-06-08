export function modelPolicy(kind: string) {
  if (kind === "video") return { providerGroup: "media", timeoutMs: 190000, history: 2 }
  if (kind === "image") return { providerGroup: "media", timeoutMs: 95000, history: 2 }
  if (kind === "code" || kind === "website") return { providerGroup: "code", timeoutMs: 90000, history: 8 }
  return { providerGroup: "text", timeoutMs: 45000, history: 12 }
}

