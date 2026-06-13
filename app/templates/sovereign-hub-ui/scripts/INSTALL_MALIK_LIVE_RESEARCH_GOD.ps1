param(
  [switch]$SkipBuild,
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"

function Say($Text, $Color = "Cyan") {
  Write-Host $Text -ForegroundColor $Color
}

function Write-Utf8File {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$Content
  )

  $Dir = Split-Path $Path
  if ($Dir -and !(Test-Path $Dir)) {
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  }

  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
  Say "✅ wrote $Path" "Green"
}

function Get-RepoRoot {
  try {
    $root = git rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and $root) { return $root.Trim() }
  } catch {}
  throw "❌ Git repo not found. Open Malik-AI-TITAN folder first."
}

Say "🚀 MALIK AI TITAN — installing Live Internet Research Mode..." "Cyan"

$RepoRoot = Get-RepoRoot
$UiRoot = Join-Path $RepoRoot "app\templates\sovereign-hub-ui"

if (!(Test-Path (Join-Path $UiRoot "package.json"))) {
  if (Test-Path (Join-Path $RepoRoot "package.json")) {
    $UiRoot = $RepoRoot
  } else {
    throw "❌ Cannot find Next.js app package.json. Expected app\templates\sovereign-hub-ui\package.json"
  }
}

Say "📁 Repo root: $RepoRoot" "DarkCyan"
Say "📁 UI root:   $UiRoot" "DarkCyan"

$LibDir = Join-Path $UiRoot "lib\malik-research"
$CompDir = Join-Path $UiRoot "components\malik-research"
$HookDir = Join-Path $UiRoot "hooks"
$ApiDir = Join-Path $UiRoot "app\api\malik-research"
$PageDir = Join-Path $UiRoot "app\research-lab"
$ScriptDir = Join-Path $UiRoot "scripts"

New-Item -ItemType Directory -Force -Path $LibDir, $CompDir, $HookDir, $ApiDir, $PageDir, $ScriptDir | Out-Null

Write-Utf8File (Join-Path $LibDir "types.ts") @'
export type SearchResult = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  publishedAt?: string;
};

export type FetchedSource = {
  title: string;
  url: string;
  domain: string;
  text: string;
  snippet?: string;
  publishedAt?: string;
};

export type ResearchFinal = {
  answer: string;
  sources: SearchResult[];
  webSourceCount: number;
  cached: boolean;
  tookMs: number;
};
'@

Write-Utf8File (Join-Path $LibDir "cache.ts") @'
type CacheItem<T> = {
  value: T;
  expiresAt: number;
};

const memory = new Map<string, CacheItem<unknown>>();

export function normalizeCacheKey(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 420);
}

export function getCache<T>(key: string): T | null {
  const item = memory.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    memory.delete(key);
    return null;
  }

  return item.value as T;
}

export function setCache<T>(key: string, value: T, ttlMs?: number) {
  const ttl =
    ttlMs ||
    Number(process.env.RESEARCH_CACHE_TTL_MS || 1000 * 60 * 60 * 6);

  memory.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}
'@

Write-Utf8File (Join-Path $LibDir "utils.ts") @'
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
    .replace(/&nbsp;/g, " ");
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
  return stripHtml(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function clampText(input: string, max = 18000) {
  if (input.length <= max) return input;
  return input.slice(0, max) + "\n...[trimmed]";
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 MALIK-AI-ResearchBot/1.0 OpenSourceResearch",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
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
          "the",
          "and",
          "with",
          "from",
          "this",
          "that",
          "your",
          "find",
        ].includes(w)
    )
    .slice(0, 18);
}
'@

Write-Utf8File (Join-Path $LibDir "search.ts") @'
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
'@

Write-Utf8File (Join-Path $LibDir "fetch-page.ts") @'
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
'@

Write-Utf8File (Join-Path $LibDir "rank.ts") @'
import type { FetchedSource, SearchResult } from "./types";
import { getQueryTerms } from "./utils";

const strongWords = [
  "ai",
  "artificial",
  "intelligence",
  "hackathon",
  "competition",
  "contest",
  "accelerator",
  "startup",
  "event",
  "application",
  "deadline",
  "2026",
  "kazakhstan",
  "astana",
  "almaty",
  "ии",
  "хакатон",
  "конкурс",
  "соревнование",
  "акселератор",
  "стартап",
  "мероприятие",
  "дедлайн",
  "заявки",
  "казахстан",
  "астана",
  "алматы",
];

function scoreText(question: string, text: string) {
  const lower = text.toLowerCase();
  const terms = getQueryTerms(question);

  let score = 0;

  for (const t of terms) {
    if (lower.includes(t)) score += 4;
  }

  for (const t of strongWords) {
    if (lower.includes(t)) score += 2;
  }

  if (/20\d{2}/.test(lower)) score += 3;
  if (/(deadline|application|apply|заявк|дедлайн|регистрац)/i.test(lower)) score += 4;

  return score;
}

export function dedupeSearchResults(results: SearchResult[], max = 24) {
  const seenUrl = new Set<string>();
  const seenDomainCount = new Map<string, number>();
  const out: SearchResult[] = [];

  for (const r of results) {
    const key = r.url.split("#")[0];
    const domainCount = seenDomainCount.get(r.domain) || 0;

    if (seenUrl.has(key)) continue;
    if (domainCount >= 3) continue;

    seenUrl.add(key);
    seenDomainCount.set(r.domain, domainCount + 1);
    out.push(r);

    if (out.length >= max) break;
  }

  return out;
}

export function rankSources(question: string, sources: FetchedSource[], max = 8) {
  return sources
    .map((s) => ({
      source: s,
      score:
        scoreText(question, `${s.title} ${s.snippet || ""}`) * 2 +
        scoreText(question, s.text),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.source);
}
'@

Write-Utf8File (Join-Path $LibDir "answer.ts") @'
import type { FetchedSource, SearchResult } from "./types";
import { escapeMd, getQueryTerms } from "./utils";

function extractDates(text: string) {
  const months =
    "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";

  const regex = new RegExp(
    `(\\d{1,2}\\s+(?:${months})\\s+20\\d{2}|\\d{1,2}[./-]\\d{1,2}[./-]20?\\d{2}|20\\d{2})`,
    "gi"
  );

  return Array.from(new Set((text.match(regex) || []).slice(0, 5)));
}

function bestExcerpt(question: string, text: string, fallback?: string) {
  const terms = getQueryTerms(question);
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|;\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 60 && s.length < 420);

  const scored = sentences
    .map((s) => {
      const lower = s.toLowerCase();
      let score = 0;

      for (const t of terms) {
        if (lower.includes(t)) score += 3;
      }

      if (/(deadline|application|apply|заявк|дедлайн|регистрац|hackathon|хакатон|accelerator|акселератор|competition|конкурс)/i.test(s)) {
        score += 6;
      }

      if (/20\d{2}/.test(s)) score += 3;

      return { s, score };
    })
    .sort((a, b) => b.score - a.score);

  return escapeMd(scored[0]?.s || fallback || text.slice(0, 260));
}

function sourceLine(i: number, s: FetchedSource, question: string) {
  const dates = extractDates(`${s.title} ${s.snippet || ""} ${s.text}`).join(", ");
  const excerpt = bestExcerpt(question, s.text, s.snippet);
  const dateText = dates || "дата не найдена в видимом тексте";

  return `| ${i + 1} | [${escapeMd(s.title)}](${s.url}) | ${escapeMd(s.domain)} | ${escapeMd(dateText)} | ${excerpt} |`;
}

export function buildResearchAnswer(question: string, ranked: FetchedSource[], allSources: SearchResult[]) {
  if (!ranked.length) {
    return [
      "Я попробовал проверить открытые источники, но не смог достать достаточно читаемого текста со страниц.",
      "",
      "Что можно сделать:",
      "1. Указать более точный запрос.",
      "2. Добавить `SEARXNG_URL` для стабильного поиска без платного API.",
      "3. Проверить, не блокируют ли сайты сервер Render.",
    ].join("\n");
  }

  const isOpportunity =
    /(хакатон|соревн|конкурс|мероприят|акселератор|заявк|deadline|hackathon|competition|accelerator|event|startup)/i.test(
      question
    );

  const intro = isOpportunity
    ? "Я проверил открытые источники и собрал варианты, где потенциально можно искать мероприятия, заявки, хакатоны, акселераторы и конкурсы для MALIK AI. Я не пишу, что прочитал весь интернет: ниже только найденные открытые источники."
    : "Я проверил открытые источники и собрал ответ только по найденным страницам. Если данных мало, лучше перепроверить важные даты вручную.";

  const table = [
    "| # | Источник | Домен | Даты/следы времени | Что найдено |",
    "|---|---|---|---|---|",
    ...ranked.map((s, i) => sourceLine(i, s, question)),
  ].join("\n");

  const best = ranked
    .slice(0, 5)
    .map((s, i) => {
      const excerpt = bestExcerpt(question, s.text, s.snippet);
      return `${i + 1}. **${s.title}** — ${excerpt}  \n   Источник: ${s.url}`;
    })
    .join("\n\n");

  const nextActions = isOpportunity
    ? [
        "## Что делать прямо сейчас",
        "1. Открой первые 3–5 источников и проверь дедлайн/возраст/город.",
        "2. Для каждой заявки упакуй MALIK AI как: `AI command layer for building, automating, coding, designing, analyzing and launching projects`.",
        "3. Если конкурс 18+, укажи взрослого сооснователя/представителя.",
        "4. Сохрани ссылки в отдельный файл `opportunities.md` и обновляй каждый день.",
      ].join("\n")
    : [
        "## Что делать дальше",
        "1. Проверь самые важные факты по источникам.",
        "2. Если нужна точность по датам/ценам/правилам — открой первоисточник.",
        "3. Сформулируй следующий запрос уже точнее, и MALIK AI сузит поиск.",
      ].join("\n");

  return [
    intro,
    "",
    "## Самое важное из найденного",
    best,
    "",
    "## Таблица источников",
    table,
    "",
    nextActions,
    "",
    `Проверено ссылок в поиске: **${allSources.length}**. Прочитано страниц: **${ranked.length}**.`,
  ].join("\n");
}
'@

Write-Utf8File (Join-Path $LibDir "research.ts") @'
import { buildResearchAnswer } from "./answer";
import { getCache, normalizeCacheKey, setCache } from "./cache";
import { fetchPageText } from "./fetch-page";
import { dedupeSearchResults, rankSources } from "./rank";
import { searchWeb } from "./search";
import type { FetchedSource, ResearchFinal, SearchResult } from "./types";

type Emit = (event: string, data: any) => void;

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

  const queries = [
    q,
    `${q} ${year}`,
  ];

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
    if (page) {
      fetched.push(page);
    }
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
'@

Write-Utf8File (Join-Path $ApiDir "route.ts") @'
import { runResearch } from "../../../lib/malik-research/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  let message = "";

  try {
    const body = await req.json();
    message = String(body.message || "").trim();
  } catch {
    message = "";
  }

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(
            sse(event, {
              ...data,
              at: Date.now(),
            })
          )
        );
      };

      try {
        const result = await runResearch(message, emit);
        emit("answer", result);
        emit("done", { text: "Готово" });
      } catch (error: any) {
        emit("error", {
          text: error?.message || "Research failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
'@

Write-Utf8File (Join-Path $HookDir "useMalikResearch.ts") @'
"use client";

import { useCallback, useRef, useState } from "react";

export type MalikResearchSource = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  publishedAt?: string;
};

export type MalikResearchStep = {
  type: string;
  text: string;
  domain?: string;
  at: number;
};

export function useMalikResearch() {
  const [active, setActive] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<MalikResearchSource[]>([]);
  const [steps, setSteps] = useState<MalikResearchStep[]>([]);
  const [webSourceCount, setWebSourceCount] = useState(0);
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addStep = useCallback((type: string, data: any) => {
    setSteps((prev) =>
      [
        ...prev,
        {
          type,
          text: String(data?.text || ""),
          domain: data?.domain,
          at: Number(data?.at || Date.now()),
        },
      ].slice(-60)
    );
  }, []);

  const run = useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setActive(true);
      setAnswer("");
      setSources([]);
      setSteps([]);
      setWebSourceCount(0);
      setCached(false);

      const res = await fetch("/api/malik-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setActive(false);
        throw new Error("MALIK Research API failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const raw of events) {
          const eventLine = raw.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));

          if (!eventLine || !dataLine) continue;

          const event = eventLine.replace("event:", "").trim();

          let data: any = {};
          try {
            data = JSON.parse(dataLine.replace("data:", "").trim());
          } catch {
            data = {};
          }

          if (event === "answer") {
            setAnswer(String(data.answer || ""));
            setSources(Array.isArray(data.sources) ? data.sources : []);
            setWebSourceCount(Number(data.webSourceCount || 0));
            setCached(Boolean(data.cached));
          } else {
            addStep(event, data);
          }
        }
      }

      setActive(false);
    },
    [addStep]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setActive(false);
  }, []);

  return {
    active,
    answer,
    sources,
    steps,
    webSourceCount,
    cached,
    run,
    stop,
  };
}
'@

Write-Utf8File (Join-Path $CompDir "LiveResearchActivity.tsx") @'
"use client";

import type { MalikResearchSource, MalikResearchStep } from "../../hooks/useMalikResearch";

type Props = {
  active: boolean;
  steps: MalikResearchStep[];
  sources: MalikResearchSource[];
  webSourceCount: number;
  cached?: boolean;
};

export function LiveResearchActivity({
  active,
  steps,
  sources,
  webSourceCount,
  cached,
}: Props) {
  const visibleSteps = steps.slice(-8).reverse();
  const visibleSources = sources.slice(0, 8);

  return (
    <aside className="w-full rounded-3xl border border-white/10 bg-black/80 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl lg:max-w-[380px]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">Активность</div>
          <div className="text-xs text-white/45">
            {active ? "MALIK AI проверяет источники" : "Research status"}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
          <span
            className={`h-2 w-2 rounded-full ${
              active ? "animate-pulse bg-white" : "bg-white/30"
            }`}
          />
          {active ? "Live" : "Done"}
        </div>
      </div>

      {cached && (
        <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-100">
          ⚡ Ответ взят из кэша — API токены не потрачены повторно.
        </div>
      )}

      <div className="mb-4 space-y-2">
        {visibleSteps.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/45">
            Пока нет действий. Запусти запрос.
          </div>
        ) : (
          visibleSteps.map((step, index) => (
            <div
              key={`${step.at}-${index}`}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="text-sm leading-snug text-white/85">{step.text}</div>
              {step.domain && (
                <div className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/55">
                  {step.domain}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-xs text-white/45">Веб-источники</div>
          <div className="mt-1 text-2xl font-bold">{webSourceCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-xs text-white/45">Прочитано</div>
          <div className="mt-1 text-2xl font-bold">{sources.length}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold text-white/80">Источники</div>

        {visibleSources.length === 0 ? (
          <div className="text-xs text-white/40">Пока нет финальных источников.</div>
        ) : (
          visibleSources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.07]"
            >
              <div className="text-xs text-white/45">{source.domain}</div>
              <div className="mt-1 line-clamp-2 text-sm font-medium text-white/90">
                {source.title}
              </div>
            </a>
          ))
        )}
      </div>
    </aside>
  );
}
'@

Write-Utf8File (Join-Path $CompDir "ResearchMarkdown.tsx") @'
"use client";

import type { ReactNode } from "react";

type Props = {
  text: string;
};

function renderInline(input: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;

  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input))) {
    if (match.index > last) parts.push(input.slice(last, match.index));

    if (match[1] && match[2]) {
      parts.push(
        <a
          key={`${match.index}-${match[2]}`}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-white/30 underline-offset-4 hover:decoration-white"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      parts.push(
        <strong key={`${match.index}-${match[3]}`} className="font-semibold text-white">
          {match[3]}
        </strong>
      );
    }

    last = regex.lastIndex;
  }

  if (last < input.length) parts.push(input.slice(last));
  return parts;
}

export function ResearchMarkdown({ text }: Props) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div className="space-y-3 text-[15px] leading-7 text-white/86">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) return <div key={index} className="h-2" />;

        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={index} className="mt-7 text-xl font-bold text-white">
              {trimmed.replace(/^##\s+/, "")}
            </h2>
          );
        }

        if (trimmed.startsWith("|")) {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70"
            >
              {trimmed}
            </pre>
          );
        }

        return <p key={index}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}
'@

Write-Utf8File (Join-Path $CompDir "ResearchLab.tsx") @'
"use client";

import { useState } from "react";
import { useMalikResearch } from "../../hooks/useMalikResearch";
import { LiveResearchActivity } from "./LiveResearchActivity";
import { ResearchMarkdown } from "./ResearchMarkdown";

export function ResearchLab() {
  const [message, setMessage] = useState(
    "найди актуальные AI хакатоны, конкурсы и акселераторы в Казахстане и онлайн для MALIK AI 2026"
  );

  const research = useMalikResearch();

  async function submit() {
    if (!message.trim() || research.active) return;
    await research.run(message.trim());
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row">
        <section className="min-w-0 flex-1">
          <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black">
            <div className="mb-2 text-sm uppercase tracking-[0.25em] text-white/35">
              MALIK AI
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Live Internet Research Mode
            </h1>
            <p className="mt-3 max-w-3xl text-white/55">
              Свежий поиск по открытым источникам, чтение страниц, кэширование и
              ответ с источниками. По умолчанию почти без траты AI API токенов.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black px-4 text-white outline-none placeholder:text-white/25 focus:border-white/30"
                placeholder="Спроси про свежие события, конкурсы, новости..."
              />

              <button
                onClick={submit}
                disabled={research.active}
                className="rounded-2xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {research.active ? "Ищу..." : "Запустить"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
            {research.answer ? (
              <ResearchMarkdown text={research.answer} />
            ) : (
              <div className="py-16 text-center text-white/35">
                Запусти Live Research — здесь появится ответ с источниками.
              </div>
            )}
          </div>
        </section>

        <div className="lg:sticky lg:top-6 lg:h-fit">
          <LiveResearchActivity
            active={research.active}
            steps={research.steps}
            sources={research.sources}
            webSourceCount={research.webSourceCount}
            cached={research.cached}
          />
        </div>
      </div>
    </main>
  );
}
'@

Write-Utf8File (Join-Path $PageDir "page.tsx") @'
import { ResearchLab } from "../../components/malik-research/ResearchLab";

export default function ResearchLabPage() {
  return <ResearchLab />;
}
'@

$EnvExample = Join-Path $UiRoot ".env.example"
$EnvAdd = @"

# MALIK AI Live Research Mode
NEXT_PUBLIC_RESEARCH_MODE=true
RESEARCH_MAX_QUERIES=5
RESEARCH_MAX_PAGES=8
RESEARCH_MAX_TEXT=18000
RESEARCH_CACHE_TTL_MS=21600000

# Optional: self-hosted search for stable zero-token browsing
SEARXNG_URL=
"@

if (Test-Path $EnvExample) {
  $current = Get-Content $EnvExample -Raw
  if ($current -notmatch "NEXT_PUBLIC_RESEARCH_MODE") {
    Add-Content -Path $EnvExample -Value $EnvAdd
    Say "✅ updated .env.example" "Green"
  } else {
    Say "ℹ️ .env.example already has research env vars" "DarkYellow"
  }
} else {
  Write-Utf8File $EnvExample $EnvAdd
}

Push-Location $UiRoot

try {
  if (!(Test-Path "node_modules")) {
    Say "📦 node_modules not found. Running npm install --legacy-peer-deps..." "Yellow"
    npm install --legacy-peer-deps
  }

  if (!$SkipBuild) {
    $pkg = Get-Content "package.json" -Raw

    if ($pkg -match '"typecheck"') {
      Say "🧪 npm run typecheck" "Cyan"
      npm run typecheck
    }

    Say "🏗️ npm run build" "Cyan"
    npm run build
  } else {
    Say "⚠️ Build skipped by -SkipBuild" "Yellow"
  }
}
finally {
  Pop-Location
}

Push-Location $RepoRoot

try {
  git add app/templates/sovereign-hub-ui/lib/malik-research `
          app/templates/sovereign-hub-ui/components/malik-research `
          app/templates/sovereign-hub-ui/hooks/useMalikResearch.ts `
          app/templates/sovereign-hub-ui/app/api/malik-research `
          app/templates/sovereign-hub-ui/app/research-lab `
          app/templates/sovereign-hub-ui/.env.example `
          app/templates/sovereign-hub-ui/scripts/INSTALL_MALIK_LIVE_RESEARCH_GOD.ps1

  $changes = git status --porcelain

  if (!$changes) {
    Say "✅ No git changes. Everything already installed." "Green"
  } else {
    git commit -m "feat: add MALIK live internet research mode"

    if (!$NoPush) {
      Say "🚀 Pushing to origin main..." "Cyan"
      git push origin main
      Say "✅ Pushed to GitHub. Render deploy should start automatically." "Green"
    } else {
      Say "⚠️ Push skipped by -NoPush. Run: git push origin main" "Yellow"
    }
  }
}
finally {
  Pop-Location
}

Say ""
Say "🔥 DONE. Test after deploy:" "Green"
Say "/research-lab" "White"
Say "API: /api/malik-research" "White"
Say ""
Say "Render env to add:" "Yellow"
Say "NEXT_PUBLIC_RESEARCH_MODE=true"
Say "RESEARCH_MAX_QUERIES=5"
Say "RESEARCH_MAX_PAGES=8"
Say "RESEARCH_MAX_TEXT=18000"
Say "RESEARCH_CACHE_TTL_MS=21600000"
Say "SEARXNG_URL="
