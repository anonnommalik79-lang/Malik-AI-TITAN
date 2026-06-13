export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function decodeHtml(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function stripHtml(input: string) {
  return decodeHtml(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function cleanTitle(input?: string) {
  return stripHtml(input || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function clampText(input: string, max = 18000) {
  if (input.length <= max) return input;
  return input.slice(0, max) + "\n...[trimmed]";
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 MALIK-AI-ResearchBot/1.0 OpenSourceResearch",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export function escapeMd(input: string) {
  return input.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

export function getQueryTerms(question: string) {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter(
      (w) =>
        ![
          "что",
          "как",
          "где",
          "для",
          "или",
          "меня",
          "мой",
          "моя",
          "это",
          "надо",
          "найди",
          "the",
          "and",
          "with",
          "from",
          "this",
          "that",
          "your",
          "find",
        ].includes(w)
    )
    .slice(0, 18);
}
