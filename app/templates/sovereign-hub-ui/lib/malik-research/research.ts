import { buildResearchAnswer } from "./answer";
import { getCache, normalizeCacheKey, setCache } from "./cache";
import { fetchPageText } from "./fetch-page";
import { dedupeSearchResults, rankSources } from "./rank";
import { searchWeb } from "./search";
import type { FetchedSource, ResearchFinal, SearchResult } from "./types";

type Emit = (event: string, data: Record<string, unknown>) => void;

function currentYear() {
  return new Date().getFullYear();
}

export function needsLiveResearch(message: string) {
  return /(актуальн|свеж|сейчас|сегодня|новост|мероприят|соревн|хакатон|конкурс|дедлайн|заявк|202\d|latest|today|current|news|event|hackathon|competition|deadline|accelerator|startup|president|президент|ceo|price|schedule|wiki|wikipedia|википед|истори)/i.test(
    message
  );
}

function buildQueries(message: string) {
  const year = currentYear();
  const q = message.trim().replace(/\s+/g, " ");
  const queries = [q];

  if (!/\b20\d{2}\b/.test(q)) queries.push(`${q} ${year}`);
  queries.push(`${q} official source`);

  if (/(ии|ai|artificial|малик|malik|стартап|startup|хакатон|hackathon|акселератор|accelerator|соревн|competition|конкурс)/i.test(q)) {
    queries.push(`AI hackathon accelerator competition startup Kazakhstan online ${year}`);
    queries.push(`site:astanahub.com AI accelerator hackathon startup ${year}`);
  }

  if (/(президент|president|usa|сша|united states|ақш)/i.test(q)) {
    queries.push(`current president of the United States official ${year}`);
    queries.push(`White House president United States ${year}`);
  }

  if (/(википед|wiki|wikipedia|history|истори)/i.test(q)) {
    queries.push(`${q} wikipedia`);
  }

  const maxQueries = Math.min(Number(process.env.RESEARCH_MAX_QUERIES || 3), Number(process.env.RESEARCH_TURBO_MAX_QUERIES || 3));
  return Array.from(new Set(queries)).slice(0, Math.max(1, maxQueries));
}

function sourceToFetchedSource(result: SearchResult): FetchedSource | null {
  const text = [result.title, result.snippet, result.url].filter(Boolean).join(". ").trim();
  if (!text || text.length < 20) return null;

  return {
    title: result.title || result.url,
    url: result.url,
    domain: result.domain,
    text,
    snippet: result.snippet,
    publishedAt: result.publishedAt,
    provider: result.provider,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function fallbackAnswer(message: string, sources: SearchResult[], tookMs: number): ResearchFinal {
  const listed = sources.slice(0, 6);
  const lines = listed.length
    ? listed.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`).join("\n")
    : "No sources were returned by the search providers in time.";

  return {
    answer: [
      "⚡ Turbo Research Mode",
      "",
      "I searched the open web, but page reading was slow or blocked. I am returning the best search evidence instead of failing.",
      "",
      "## Fast source evidence",
      lines,
      "",
      "## What to do next",
      "Open the first official source and verify the final fact/date there.",
    ].join("\n"),
    sources: listed,
    webSourceCount: sources.length,
    cached: false,
    tookMs,
  };
}

export async function runResearch(message: string, emit: Emit): Promise<ResearchFinal> {
  const started = Date.now();

  try {
    const key = normalizeCacheKey(message);
    const cached = getCache<ResearchFinal>(key);

    if (cached) {
      emit("status", { text: "Cache hit: no repeated API spending." });
      return { ...cached, cached: true, tookMs: Date.now() - started };
    }

    const turbo = process.env.RESEARCH_TURBO !== "false";
    const maxPagesEnv = Number(process.env.RESEARCH_MAX_PAGES || 8);
    const maxPages = turbo ? Math.min(maxPagesEnv, Number(process.env.RESEARCH_TURBO_MAX_PAGES || 3)) : maxPagesEnv;
    const searchLimit = turbo ? 6 : 10;
    const searchTimeoutMs = Number(process.env.RESEARCH_TURBO_SEARCH_TIMEOUT_MS || 9000);
    const readTimeoutMs = Number(process.env.RESEARCH_TURBO_READ_TIMEOUT_MS || 5000);
    const totalTimeoutMs = Number(process.env.RESEARCH_TURBO_TOTAL_TIMEOUT_MS || 16000);

    emit("status", { text: turbo ? "⚡ Turbo live web research started..." : "Starting MALIK World AI Research pipeline..." });

    const queries = buildQueries(message);
    emit("thinking", { text: `Turbo plan: ${queries.length} searches, up to ${maxPages} pages.` });

    const searchPromise = Promise.allSettled(
      queries.map(async (query) => {
        emit("search", { text: `Search: ${query}` });
        const results = await searchWeb(query, searchLimit);
        for (const r of results) {
          emit("source", {
            text: `Found on ${r.domain}${r.provider ? ` via ${r.provider}` : ""}`,
            domain: r.domain,
          });
        }
        return results;
      })
    );

    const settledSearch = await withTimeout(searchPromise, searchTimeoutMs, []);
    const allResults: SearchResult[] = [];

    for (const item of settledSearch as PromiseSettledResult<SearchResult[]>[]) {
      if (item.status === "fulfilled") allResults.push(...item.value);
    }

    const unique = dedupeSearchResults(allResults, turbo ? 16 : 28);

    if (!unique.length) {
      const final = fallbackAnswer(message, [], Date.now() - started);
      setCache(key, final, 1000 * 60 * 5);
      emit("done", { text: "Research finished with no links. Cached short fallback." });
      return final;
    }

    emit("thinking", {
      text: `Found ${unique.length} links. Reading best sources in parallel...`,
    });

    const preferred = unique.slice(0, maxPages);
    const remainingTime = Math.max(4000, totalTimeoutMs - (Date.now() - started));

    const readPromise = Promise.allSettled(
      preferred.map(async (result) => {
        emit("reading", {
          text: `Reading ${result.domain}${result.provider ? ` via ${result.provider}` : ""}`,
          domain: result.domain,
        });
        return await withTimeout(fetchPageText(result), readTimeoutMs, null);
      })
    );

    const settledRead = await withTimeout(readPromise, remainingTime, []);
    const fetched: FetchedSource[] = [];

    for (const item of settledRead as PromiseSettledResult<FetchedSource | null>[]) {
      if (item.status === "fulfilled" && item.value) fetched.push(item.value);
    }

    // Critical speed fallback: use provider snippets if full page reading is slow/blocked.
    if (fetched.length < 2) {
      for (const result of preferred) {
        const source = sourceToFetchedSource(result);
        if (source) fetched.push(source);
        if (fetched.length >= Math.max(2, Math.min(maxPages, 4))) break;
      }
    }

    const ranked = rankSources(message, fetched, maxPages);

    emit("thinking", {
      text: "Ranking evidence and preparing fast answer...",
    });

    if (!ranked.length) {
      const final = fallbackAnswer(message, unique, Date.now() - started);
      setCache(key, final);
      emit("done", { text: `Research fallback complete in ${Math.round(final.tookMs / 1000)}s. Cached.` });
      return final;
    }

    let answer = buildResearchAnswer(message, ranked, unique);

    if (turbo) {
      answer = [
        "⚡ Turbo Research Mode",
        "",
        answer,
      ].join("\n");
    }

    const final: ResearchFinal = {
      answer,
      sources: ranked.map((s) => ({
        title: s.title,
        url: s.url,
        domain: s.domain,
        snippet: s.snippet,
        publishedAt: s.publishedAt,
        provider: s.provider,
      })),
      webSourceCount: unique.length,
      cached: false,
      tookMs: Date.now() - started,
    };

    setCache(key, final);
    emit("done", { text: `Research complete in ${Math.round(final.tookMs / 1000)}s. Cached.` });

    return final;
  } catch (error) {
    const final = fallbackAnswer(message, [], Date.now() - started);
    emit("error", { text: error instanceof Error ? error.message : "Research failed" });
    return final;
  }
}
