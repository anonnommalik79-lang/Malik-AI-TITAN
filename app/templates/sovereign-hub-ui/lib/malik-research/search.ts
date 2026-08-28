import type { SearchResult } from "./types";
import { cleanTitle, decodeHtml, domainOf, fetchWithTimeout, stripHtml } from "./utils";

function uniqueResults(results: SearchResult[], limit: number) {
  const seen = new Set<string>();
  const out: SearchResult[] = [];

  for (const item of results) {
    if (!item.url || !item.url.startsWith("http")) continue;
    if (item.url.includes("duckduckgo.com/y.js")) continue;

    const key = item.url.split("#")[0].replace(/\/$/, "");
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(item);

    if (out.length >= limit) break;
  }

  return out;
}

function normalizeResult(r: Partial<SearchResult>, provider: string): SearchResult | null {
  const url = String(r.url || "").trim();
  if (!url.startsWith("http")) return null;

  return {
    title: cleanTitle(String(r.title || url)),
    url,
    domain: r.domain || domainOf(url),
    snippet: stripHtml(String(r.snippet || "")),
    publishedAt: r.publishedAt,
    score: r.score,
    provider,
  };
}

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

async function searchSerper(query: string, limit: number): Promise<SearchResult[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];

  const res = await fetchWithTimeout(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: Math.min(limit, 10) }),
    },
    7000
  );

  if (!res.ok) return [];

  const data = await res.json();
  const organic = Array.isArray(data.organic) ? data.organic : [];

  return uniqueResults(
    organic
      .map((x: any) =>
        normalizeResult(
          {
            title: x.title,
            url: x.link,
            snippet: x.snippet,
            publishedAt: x.date,
          },
          "serper"
        )
      )
      .filter(Boolean) as SearchResult[],
    limit
  );
}

async function tavilyFetch(query: string, limit: number, key: string, useBearer: boolean) {
  return fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(useBearer ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        ...(useBearer ? {} : { api_key: key }),
        query,
        max_results: Math.min(limit, 10),
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      }),
    },
    8000
  );
}

async function searchTavily(query: string, limit: number): Promise<SearchResult[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];

  let res = await tavilyFetch(query, limit, key, false);

  if (!res.ok && [401, 403, 422].includes(res.status)) {
    res = await tavilyFetch(query, limit, key, true);
  }

  if (!res.ok) return [];

  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];

  return uniqueResults(
    results
      .map((x: any) =>
        normalizeResult(
          {
            title: x.title,
            url: x.url,
            snippet: x.content,
            score: x.score,
          },
          "tavily"
        )
      )
      .filter(Boolean) as SearchResult[],
    limit
  );
}

async function searchBrave(query: string, limit: number): Promise<SearchResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) return [];

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(limit, 20)));
  url.searchParams.set("freshness", "py");

  const res = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        "X-Subscription-Token": key,
        accept: "application/json",
      },
    },
    8000
  );

  if (!res.ok) return [];

  const data = await res.json();
  const results = Array.isArray(data.web?.results) ? data.web.results : [];

  return uniqueResults(
    results
      .map((x: any) =>
        normalizeResult(
          {
            title: x.title,
            url: x.url,
            snippet: x.description,
            publishedAt: x.age,
          },
          "brave"
        )
      )
      .filter(Boolean) as SearchResult[],
    limit
  );
}

function parseJinaSearch(markdown: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = markdown
    .split(/\n(?=Title:\s)/g)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const title =
      block.match(/^Title:\s*(.+)$/im)?.[1]?.trim() ||
      block.match(/^#\s+(.+)$/im)?.[1]?.trim();

    const url =
      block.match(/^URL Source:\s*(https?:\/\/\S+)/im)?.[1]?.trim() ||
      block.match(/^URL:\s*(https?:\/\/\S+)/im)?.[1]?.trim() ||
      block.match(/(https?:\/\/[^\s)]+)/i)?.[1]?.trim();

    if (!title || !url) continue;

    const snippet = stripHtml(
      block
        .replace(/^Title:.*$/gim, "")
        .replace(/^URL Source:.*$/gim, "")
        .replace(/^URL:.*$/gim, "")
        .replace(/^Markdown Content:.*$/gim, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600)
    );

    const item = normalizeResult({ title, url, snippet }, "jina");
    if (item) results.push(item);
  }

  return uniqueResults(results, limit);
}

async function searchJina(query: string, limit: number): Promise<SearchResult[]> {
  if (process.env.JINA_SEARCH_DISABLED === "true") return [];

  const base = (process.env.JINA_SEARCH_URL || "https://s.jina.ai/").replace(/\/+$/, "");
  const url = base + "/" + encodeURIComponent(query);

  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        accept: "text/plain, text/markdown, */*",
      },
    },
    8000
  );

  if (!res.ok) return [];

  const text = await res.text();
  return parseJinaSearch(text, limit);
}

async function searchSearxng(query: string, limit: number): Promise<SearchResult[]> {
  const base = process.env.SEARXNG_URL?.trim();
  if (!base || base === "value") return [];

  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "auto");

  const res = await fetchWithTimeout(url.toString(), {}, 8000);
  if (!res.ok) return [];

  const data = await res.json();
  const raw = Array.isArray(data.results) ? data.results : [];

  return uniqueResults(
    raw
      .map((r: any) =>
        normalizeResult(
          {
            title: String(r.title || r.url || ""),
            url: String(r.url || ""),
            snippet: String(r.content || r.snippet || ""),
            publishedAt: r.publishedDate || r.published_at || undefined,
          },
          "searxng"
        )
      )
      .filter(Boolean) as SearchResult[],
    limit
  );
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const url = "https://duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const res = await fetchWithTimeout(url, {}, 8000);
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
    const item = normalizeResult({ title, url: rawUrl, snippet }, "duckduckgo");
    if (item) results.push(item);
  }

  return uniqueResults(results, limit);
}

async function runProvider(name: string, fn: () => Promise<SearchResult[]>) {
  try {
    const results = await fn();
    return results.map((r) => ({ ...r, provider: r.provider || name }));
  } catch {
    return [];
  }
}

export async function searchWeb(query: string, limit = 8): Promise<SearchResult[]> {
  const fastSettled = await Promise.all([
    runProvider("serper", () => searchSerper(query, limit)),
    runProvider("tavily", () => searchTavily(query, limit)),
    runProvider("brave", () => searchBrave(query, limit)),
    runProvider("jina", () => searchJina(query, limit)),
  ]);

  const fastMerged = fastSettled.flat();

  if (fastMerged.length >= Math.min(4, limit)) {
    return uniqueResults(
      fastMerged.sort((a, b) => (b.score || 0) - (a.score || 0)),
      limit
    );
  }

  const backupSettled = await Promise.all([
    runProvider("searxng", () => searchSearxng(query, limit)),
    runProvider("duckduckgo", () => searchDuckDuckGo(query, limit)),
  ]);

  const merged = [...fastMerged, ...backupSettled.flat()];

  return uniqueResults(
    merged.sort((a, b) => (b.score || 0) - (a.score || 0)),
    limit
  );
}

/** Voice needs one quick search, not a paid fan-out to every configured service. */
export async function searchVoiceWeb(query: string, limit = 4): Promise<SearchResult[]> {
  for (const [name, run] of [
    ["serper", searchSerper], ["tavily", searchTavily], ["brave", searchBrave],
  ] as const) {
    const results = await runProvider(name, () => run(query, limit));
    if (results.length) return results;
  }
  return [];
}
