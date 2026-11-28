import type { FetchedSource, SearchResult } from "./types";
import { clampText, cleanTitle, decodePageHtml, fetchWithTimeout, stripHtml } from "./utils";
import { fetchPublicPage, publicAddresses } from "./public-page-fetch";
import { readStructuredRetailOffer } from "../live-intelligence/retail-evidence";
import { pageDates } from "../live-intelligence/page-dates";
import { assertPublicHttpUrl } from "@/lib/server/request-safety";
import { parallelSearchEnabled, readParallelPage, readTavilyPage } from "./free-web";

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

async function fetchDirect(result: SearchResult, signal: AbortSignal, product = false): Promise<FetchedSource | null> {
  const target = safeSourceUrl(result);
  const res = await fetchPublicPage(target, signal);
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

  const html = decodePageHtml(await res.arrayBuffer(), contentType);
  const title = extractTitle(html, result.title || target);
  const text = clampText(stripHtml(html), Number(process.env.RESEARCH_MAX_TEXT || 18000));

  const retailOffer = product ? readStructuredRetailOffer(html, target) : undefined;
  if ((!text || text.length < 280) && !retailOffer) return null;

  const image = extractPageImage(html, target);
  return {
    title: title || result.title,
    url: target,
    domain: result.domain,
    text,
    snippet: result.snippet,
    publishedAt: pageDates(html).publishedAt || result.publishedAt,
    updatedAt: pageDates(html).updatedAt,
    checkedAt: new Date().toISOString(),
    readAt: new Date().toISOString(),
    provider: result.provider,
    ...(image ? { image } : {}),
    ...(retailOffer ? { retailOffer } : {}),
  };
}

function parseJinaTitle(markdown: string, fallback: string) {
  return (
    markdown.match(/^Title:[ \t]*([^\r\n]+)$/im)?.[1]?.trim() ||
    markdown.match(/^#\s+(.+)$/im)?.[1]?.trim() ||
    fallback
  );
}

async function fetchViaJina(result: SearchResult, signal?: AbortSignal): Promise<FetchedSource | null> {
  if (process.env.JINA_READER_DISABLED === "true") return null;

  const target = safeSourceUrl(result);
  const readerUrl = "https://r.jina.ai/" + target;

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

export async function fetchPageText(result: SearchResult, options: { signal?: AbortSignal; timeoutMs?: number; product?: boolean } = {}): Promise<FetchedSource | null> {
  const timeoutMs = options.timeoutMs || 9000;
  const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]);
  let target: string;
  try {
    // Validate before either the direct reader or the third-party reader sees it.
    target = safeSourceUrl(result);
    await publicAddresses(new URL(target).hostname, undefined, signal);
  } catch {
    return null;
  }

  try {
    const directBudget = Math.max(1, Math.min(4200, Math.floor(timeoutMs * 0.4)));
    const direct = await fetchDirect(result, AbortSignal.any([signal, AbortSignal.timeout(directBudget)]), options.product);
    if (direct) return direct;
  } catch {
    // Retain time for the alternate readers.
  }
  if (signal.aborted) return null;

  const fallback = new AbortController();
  const fallbackSignal = AbortSignal.any([signal, fallback.signal]);
  const readers = canSendToExternalReader(target) ? [
    ...(parallelSearchEnabled() ? [readParallelPage(result, target, fallbackSignal)] : []),
    readTavilyPage(result, target, fallbackSignal),
    fetchViaJina(result, fallbackSignal),
  ] : [];
  try {
    return await Promise.any(readers.map(async (reader) => {
      const page = await reader;
      fallbackSignal.throwIfAborted();
      if (!page) throw new Error("Reader returned no page text");
      return page;
    }));
  } catch {
    return null;
  } finally {
    fallback.abort();
  }
}

function canSendToExternalReader(target: string) {
  const url = new URL(target);
  return ![...url.searchParams.keys()].some(key => /token|secret|session|password|signature|auth|api[-_]?key/iu.test(key));
}
