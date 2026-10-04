import type { FetchedSource, SearchResult } from "./types";
import { clampText, cleanTitle, fetchWithTimeout, stripHtml } from "./utils";
import { assertPublicHttpUrl } from "@/lib/server/request-safety";

function extractTitle(html: string, fallback: string) {
  const m =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i);

  return cleanTitle(m?.[1] || fallback);
}

/**
 * The picture a page chose to represent itself (og:image, twitter:image,
 * image_src) - what ChatGPT shows next to an event or a fund. Only https, no
 * data: or tracking-sized tricks, resolved against the page address.
 */
export function extractPageImage(html: string, pageUrl: string): string | undefined {
  const head = html.slice(0, 200_000)
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
  ]
  for (const pattern of patterns) {
    const raw = pattern.exec(head)?.[1]?.trim().replace(/&amp;/g, "&")
    if (!raw) continue
    try {
      const url = new URL(raw, pageUrl)
      if (url.protocol !== "https:" || url.username || url.password || url.href.length > 1200) continue
      if (/(?:^|[/_.-])(?:1x1|pixel|spacer|blank)\.(?:gif|png)$/i.test(url.pathname)) continue
      return url.href
    } catch {
      continue
    }
  }
  return undefined
}

function safeSourceUrl(result: SearchResult) {
  return assertPublicHttpUrl(String(result.url || "")).toString();
}

async function fetchDirect(result: SearchResult, signal?: AbortSignal): Promise<FetchedSource | null> {
  const target = safeSourceUrl(result);
  const res = await fetchWithTimeout(target, { signal }, 6000);
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
  const title = extractTitle(html, result.title || target);
  const text = clampText(stripHtml(html), Number(process.env.RESEARCH_MAX_TEXT || 18000));

  if (!text || text.length < 280) return null;

  const image = extractPageImage(html, target);
  return {
    title: title || result.title,
    url: target,
    domain: result.domain,
    text,
    snippet: result.snippet,
    publishedAt: result.publishedAt,
    provider: result.provider,
    ...(image ? { image } : {}),
  };
}

function parseJinaTitle(markdown: string, fallback: string) {
  return (
    markdown.match(/^Title:\s*(.+)$/im)?.[1]?.trim() ||
    markdown.match(/^#\s+(.+)$/im)?.[1]?.trim() ||
    fallback
  );
}

async function fetchViaJina(result: SearchResult, signal?: AbortSignal): Promise<FetchedSource | null> {
  if (process.env.JINA_READER_DISABLED === "true") return null;

  const target = safeSourceUrl(result);
  const readerUrl = "https://r.jina.ai/http://" + target.replace(/^https?:\/\//, "");

  try {
    const res = await fetchWithTimeout(
      readerUrl,
      {
        signal,
        headers: {
          accept: "text/plain, text/markdown, */*",
        },
      },
      15000
    );

    if (!res.ok) return null;

    const markdown = await res.text();
    const text = clampText(stripHtml(markdown), Number(process.env.RESEARCH_MAX_TEXT || 18000));
    if (!text || text.length < 220) return null;

    return {
      title: cleanTitle(parseJinaTitle(markdown, result.title)),
      url: target,
      domain: result.domain,
      text,
      snippet: result.snippet,
      publishedAt: result.publishedAt,
      provider: result.provider || "jina-reader",
    };
  } catch {
    return null;
  }
}

export async function fetchPageText(result: SearchResult, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<FetchedSource | null> {
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs || 9000), ...(options.signal ? [options.signal] : [])]);
  try {
    // Validate before either the direct reader or the third-party reader sees it.
    safeSourceUrl(result);
  } catch {
    return null;
  }

  try {
    const direct = await fetchDirect(result, signal);
    if (direct) return direct;
  } catch {
    // fallback to reader
  }

  return signal.aborted ? null : fetchViaJina(result, signal);
}
