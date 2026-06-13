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
  "president",
  "government",
  "official",
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
  "президент",
  "официальн",
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
  if (/(deadline|application|apply|заявк|дедлайн|регистрац|official|current|сейчас|официальн)/i.test(lower)) score += 4;

  return score;
}

export function dedupeSearchResults(results: SearchResult[], max = 24) {
  const seenUrl = new Set<string>();
  const seenDomainCount = new Map<string, number>();
  const out: SearchResult[] = [];

  for (const r of results) {
    const key = r.url.split("#")[0].replace(/\/$/, "");
    const domainCount = seenDomainCount.get(r.domain) || 0;

    if (seenUrl.has(key)) continue;
    if (domainCount >= 4) continue;

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
