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
  return /(актуальн|свеж|сейчас|сегодня|новост|мероприят|соревн|хакатон|конкурс|дедлайн|заявк|202\d|latest|today|current|news|event|hackathon|competition|deadline|accelerator|startup)/i.test(
    message
  );
}

function buildQueries(message: string) {
  const year = currentYear();
  const q = message.trim().replace(/\s+/g, " ");

  const queries = [q, `${q} ${year}`];

  if (/(ии|ai|artificial|малик|malik|стартап|startup|хакатон|hackathon|акселератор|accelerator|соревн|competition|конкурс)/i.test(q)) {
    queries.push(`AI hackathon accelerator competition startup Kazakhstan online ${year}`);
    queries.push(`site:astanahub.com AI accelerator hackathon startup ${year}`);
    queries.push(`site:devpost.com AI hackathon ${year}`);
  }

  return Array.from(new Set(queries)).slice(0, Number(process.env.RESEARCH_MAX_QUERIES || 5));
}

export async function runResearch(message: string, emit: Emit): Promise<ResearchFinal> {
  const started = Date.now();
  const key = normalizeCacheKey(message);
  const cached = getCache<ResearchFinal>(key);

  if (cached) {
    emit("status", { text: "⚡ Нашёл готовый результат в кэше — API токены не тратим." });
    return { ...cached, cached: true, tookMs: Date.now() - started };
  }

  const maxPages = Number(process.env.RESEARCH_MAX_PAGES || 8);

  emit("status", { text: "🌐 Запускаю MALIK Live Research без лишней траты API токенов..." });

  const queries = buildQueries(message);
  const allResults: SearchResult[] = [];

  for (const query of queries) {
    emit("search", { text: `🔎 Поиск: ${query}` });

    try {
      const results = await searchWeb(query, 8);
      for (const r of results) {
        emit("source", { text: `🌐 Поиск на ${r.domain}`, domain: r.domain });
        allResults.push(r);
      }
    } catch {
      emit("error", { text: `Не смог выполнить поиск: ${query}` });
    }
  }

  const unique = dedupeSearchResults(allResults, 24);

  emit("thinking", {
    text: `🧠 Найдено ${unique.length} ссылок. Отбираю лучшие и читаю страницы...`,
  });

  const fetched: FetchedSource[] = [];

  for (const result of unique.slice(0, maxPages)) {
    emit("reading", { text: `📄 Читаю источник: ${result.domain}`, domain: result.domain });

    const page = await fetchPageText(result);
    if (page) fetched.push(page);
  }

  const ranked = rankSources(message, fetched, maxPages);

  emit("thinking", {
    text: "🧠 Сравниваю данные, даты и релевантность для запроса...",
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
    })),
    webSourceCount: unique.length,
    cached: false,
    tookMs: Date.now() - started,
  };

  setCache(key, final);
  emit("done", { text: "✅ Live Research готов. Результат сохранён в кэше." });

  return final;
}
