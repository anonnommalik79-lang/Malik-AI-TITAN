import type { FetchedSource, SearchResult } from "./types";
import { clampText, cleanTitle, fetchWithTimeout, stripHtml } from "./utils";

function extractTitle(html: string, fallback: string) {
  const m =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i);

  return cleanTitle(m?.[1] || fallback);
}

async function fetchDirect(result: SearchResult): Promise<FetchedSource | null> {
  const res = await fetchWithTimeout(result.url, {}, 10000);
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
    provider: result.provider,
  };
}

function parseJinaTitle(markdown: string, fallback: string) {
  return (
    markdown.match(/^Title:\s*(.+)$/im)?.[1]?.trim() ||
    markdown.match(/^#\s+(.+)$/im)?.[1]?.trim() ||
    fallback
  );
}

async function fetchViaJina(result: SearchResult): Promise<FetchedSource | null> {
  if (process.env.JINA_READER_DISABLED === "true") return null;

  const readerUrl =
    "https://r.jina.ai/http://r.jina.ai/http://" + result.url.replace(/^https?:\/\//, "");

  const simpleReaderUrl =
    "https://r.jina.ai/http://" + result.url.replace(/^https?:\/\//, "");

  for (const url of [simpleReaderUrl, readerUrl]) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            accept: "text/plain, text/markdown, */*",
          },
        },
        15000
      );

      if (!res.ok) continue;

      const markdown = await res.text();
      const text = clampText(stripHtml(markdown), Number(process.env.RESEARCH_MAX_TEXT || 18000));
      if (!text || text.length < 220) continue;

      return {
        title: cleanTitle(parseJinaTitle(markdown, result.title)),
        url: result.url,
        domain: result.domain,
        text,
        snippet: result.snippet,
        publishedAt: result.publishedAt,
        provider: result.provider || "jina-reader",
      };
    } catch {
      // try next reader
    }
  }

  return null;
}

export async function fetchPageText(result: SearchResult): Promise<FetchedSource | null> {
  try {
    const direct = await fetchDirect(result);
    if (direct) return direct;
  } catch {
    // fallback to reader
  }

  try {
    return await fetchViaJina(result);
  } catch {
    return null;
  }
}
