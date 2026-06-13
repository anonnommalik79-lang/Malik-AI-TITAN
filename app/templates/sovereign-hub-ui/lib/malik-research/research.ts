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
  return /(актуальн|свеж|сейчас|сегодня|новост|мероприят|соревн|хакатон|конкурс|дедлайн|заявк|202\d|latest|today|current|news|event|hackathon|competition|deadline|accelerator|startup|president|президент)/i.test(
    message
  );
}

function buildQueries(message: string) {
  const year = currentYear();
  const q = message.trim().replace(/\s+/g, " ");

  const queries = [q, `${q} ${year}`, `${q} official source current`];

  if (/(ии|ai|artificial|малик|malik|стартап|startup|хакатон|hackathon|акселератор|accelerator|соревн|competition|конкурс)/i.test(q)) {
    queries.push(`AI hackathon accelerator competition startup Kazakhstan online ${year}`);
    queries.push(`site:astanahub.com AI accelerator hackathon startup ${year}`);
    queries.push(`site:devpost.com AI hackathon ${year}`);
  }

  if (/(президент|president|usa|сша|united states|ақш)/i.test(q)) {
    queries.push(`current president of the United States official ${year}`);
    queries.push(`White House president United States ${year}`);
  }

  return Array.from(new Set(queries)).slice(0, Number(process.env.RESEARCH_MAX_QUERIES || 6));
}

export async function runResearch(message: string, emit: Emit): Promise<ResearchFinal> {
  const started = Date.now();
  const key = normalizeCacheKey(message);
  const cached = getCache<ResearchFinal>(key);

  if (cached) {
    emit("status", { text: "Cache hit: no repeated AI/API spending." });
    return { ...cached, cached: true, tookMs: Date.now() - started };
  }

  const maxPages = Number(process.env.RESEARCH_MAX_PAGES || 8);

  emit("status", { text: "Starting MALIK World AI Research pipeline..." });

  const queries = buildQueries(message);
  const allResults: SearchResult[] = [];

  for (const query of queries) {
    emit("search", { text: `Search: ${query}` });

    try {
      const results = await searchWeb(query, 10);
      for (const r of results) {
        emit("source", {
          text: `Found on ${r.domain}${r.provider ? ` via ${r.provider}` : ""}`,
          domain: r.domain,
        });
        allResults.push(r);
      }
    } catch {
      emit("error", { text: `Search failed: ${query}` });
    }
  }

  const unique = dedupeSearchResults(allResults, 28);

  emit("thinking", {
    text: `Found ${unique.length} links. Ranking and reading best pages...`,
  });

  const fetched: FetchedSource[] = [];

  for (const result of unique.slice(0, maxPages)) {
    emit("reading", {
      text: `Reading ${result.domain}${result.provider ? ` via ${result.provider}` : ""}`,
      domain: result.domain,
    });

    const page = await fetchPageText(result);
    if (page) fetched.push(page);
  }

  const ranked = rankSources(message, fetched, maxPages);

  emit("thinking", {
    text: "Comparing evidence, dates, source quality and relevance...",
  });

  const answer = buildResearchAnswer(message, ranked, unique);

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
  emit("done", { text: "World AI Research complete. Result cached." });

  return final;
}
