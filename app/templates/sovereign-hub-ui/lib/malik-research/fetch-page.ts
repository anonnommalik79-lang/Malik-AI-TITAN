import type { FetchedSource, SearchResult } from "./types";
import { clampText, cleanTitle, fetchWithTimeout, stripHtml } from "./utils";

function extractTitle(html: string, fallback: string) {
  const m =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i);

  return cleanTitle(m?.[1] || fallback);
}

export async function fetchPageText(result: SearchResult): Promise<FetchedSource | null> {
  try {
    const res = await fetchWithTimeout(result.url, {}, 9000);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (
      contentType.includes("application/pdf") ||
      contentType.includes("image/") ||
      contentType.includes("video/") ||
      contentType.includes("audio/")
    ) {
      return null;
    }

    const html = await res.text();
    const title = extractTitle(html, result.title || result.url);
    const text = clampText(stripHtml(html), Number(process.env.RESEARCH_MAX_TEXT || 18000));

    if (!text || text.length < 280) return null;

    return {
      title: title || result.title,
      url: result.url,
      domain: result.domain,
      text,
      snippet: result.snippet,
      publishedAt: result.publishedAt,
    };
  } catch {
    return null;
  }
}
