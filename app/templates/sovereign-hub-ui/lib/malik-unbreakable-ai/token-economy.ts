export function tokenEconomy(kind: string, promptLength = 0) {
  const base = kind === "code" ? 4000 : kind === "video" || kind === "image" ? 900 : 1200
  return {
    maxOutputTokens: promptLength > 6000 ? Math.floor(base * 0.75) : base,
    historyWindow: kind === "code" ? 8 : 12,
    summarizeOldHistory: true,
    sendAttachmentsAsMetadata: true,
  }
}

