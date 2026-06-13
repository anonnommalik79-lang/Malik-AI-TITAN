import type { SearchResult } from "./types";
import { cleanTitle, decodeHtml, domainOf, fetchWithTimeout, stripHtml } from "./utils";

function unwrapDuckUrl(href: string) {
  const decoded = decodeHtml(href);

  try {
    const u = new URL(decoded, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (decoded.startsWith("http")) return decoded;
  } catch {
    // ignore
  }

  return decoded;
}

function uniqueResults(results: SearchResult[], limit: number) {
  const seen = new Set<string>();
  const out: SearchResult[] = [];

  for (const item of results) {
    if (!item.url || !item.url.startsWith("http")) continue;
    if (item.url.includes("duckduckgo.com/y.js")) continue;

    const key = item.url.split("#")[0];
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(item);

    if (out.length >= limit) break;
  }

  return out;
}

async function searchSearxng(query: string, limit: number): Promise<SearchResult[]> {
  const base = process.env.SEARXNG_URL;
  if (!base) return [];

  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "auto");

  const res = await fetchWithTimeout(url.toString(), {}, 10000);
  if (!res.ok) return [];

  const data = await res.json();
  const raw = Array.isArray(data.results) ? data.results : [];

  return uniqueResults(
    raw.map((r: any) => {
      const url = String(r.url || "");
      return {
        title: cleanTitle(String(r.title || url)),
        url,
        domain: domainOf(url),
        snippet: stripHtml(String(r.content || r.snippet || "")),
        publishedAt: r.publishedDate || r.published_at || undefined,
      };
    }),
    limit
  );
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const url = "https://duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const res = await fetchWithTimeout(url, {}, 10000);
  if (!res.ok) return [];

  const html = await res.text();
  const results: SearchResult[] = [];
  const linkRegex =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html))) {
    const rawUrl = unwrapDuckUrl(match[1]);
    const title = cleanTitle(match[2]);

    const chunk = html.slice(match.index, match.index + 1800);
    const snippetMatch =
      chunk.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
      chunk.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";

    if (rawUrl.startsWith("http") && title) {
      results.push({
        title,
        url: rawUrl,
        domain: domainOf(rawUrl),
        snippet,
      });
    }
  }

  return uniqueResults(results, limit);
}

export async function searchWeb(query: string, limit = 8): Promise<SearchResult[]> {
  const searx = await searchSearxng(query, limit);
  if (searx.length) return searx;

  return searchDuckDuckGo(query, limit);
}
