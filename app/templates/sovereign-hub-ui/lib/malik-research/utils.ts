import { fetchResearchResponse } from "./bounded-fetch";

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
    .replace(/&nbsp;/g, " ")
    .replace(/&#(x[0-9a-f]{1,6}|\d{1,7});/giu, (entity, encoded: string) => {
      const scalar = encoded[0].toLowerCase() === "x" ? parseInt(encoded.slice(1), 16) : Number(encoded);
      return scalar >= 32 && scalar <= 0x10ffff && !(scalar >= 0xd800 && scalar <= 0xdfff) ? String.fromCodePoint(scalar) : entity;
    });
}

/** Public pages may declare a legacy charset in HTTP or in an early HTML meta tag. */
export function decodePageHtml(bytes: ArrayBuffer, contentType: string) {
  const utf8 = new TextDecoder();
  const charset = /charset\s*=\s*["']?([\w-]+)/iu;
  const header = charset.exec(contentType)?.[1];
  const head = utf8.decode(bytes.slice(0, 4096));
  const meta = head.match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/iu)?.[1];
  try { return new TextDecoder(header || meta || "utf-8").decode(bytes); }
  catch { return utf8.decode(bytes); }
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

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000, signal?: AbortSignal) {
  return fetchResearchResponse(url, {
      ...init,
      signal: signal && init.signal ? AbortSignal.any([signal, init.signal]) : signal || init.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 MALIK-AI-ResearchBot/5.0 OpenSourceResearch",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.8,*/*;q=0.5",
        ...(init.headers || {}),
      },
      cache: "no-store",
  }, timeoutMs);
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
          "покажи",
          "скажи",
          "the",
          "and",
          "with",
          "from",
          "this",
          "that",
          "your",
          "find",
          "show",
        ].includes(w)
    )
    .slice(0, 18);
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
