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
    .filter((s) => s.length > 60 && s.length < 460);

  const scored = sentences
    .map((s) => {
      const lower = s.toLowerCase();
      let score = 0;

      for (const t of terms) {
        if (lower.includes(t)) score += 3;
      }

      if (/(deadline|application|apply|заявк|дедлайн|регистрац|hackathon|хакатон|accelerator|акселератор|competition|конкурс|president|президент|official|current|сейчас)/i.test(s)) {
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
  const dateText = dates || "not found";
  const provider = s.provider ? ` / ${s.provider}` : "";

  return `| ${i + 1} | [${escapeMd(s.title)}](${s.url}) | ${escapeMd(s.domain + provider)} | ${escapeMd(dateText)} | ${excerpt} |`;
}

export function buildResearchAnswer(question: string, ranked: FetchedSource[], allSources: SearchResult[]) {
  if (!ranked.length) {
    return [
      "I searched open web sources, but I could not read enough text from the found pages.",
      "",
      "What to do:",
      "1. Make the query more exact.",
      "2. Add `SERPER_API_KEY`, `TAVILY_API_KEY`, or `BRAVE_SEARCH_API_KEY` in Render for ChatGPT/Claude-level stable search.",
      "3. Keep free fallback enabled: `JINA_SEARCH_DISABLED=false` and `JINA_READER_DISABLED=false`.",
    ].join("\n");
  }

  const isOpportunity =
    /(хакатон|соревн|конкурс|мероприят|акселератор|заявк|deadline|hackathon|competition|accelerator|event|startup)/i.test(
      question
    );

  const intro = isOpportunity
    ? "I checked open sources and collected relevant opportunities, events, applications, hackathons, accelerators, and competitions for MALIK AI. I am not claiming I read the whole internet: these are the sources that were found and read."
    : "I checked open sources and built the answer from the pages that were found and read. Important facts should still be verified from the primary source.";

  const table = [
    "| # | Source | Domain / provider | Date signal | Evidence |",
    "|---|---|---|---|---|",
    ...ranked.map((s, i) => sourceLine(i, s, question)),
  ].join("\n");

  const best = ranked
    .slice(0, 5)
    .map((s, i) => {
      const excerpt = bestExcerpt(question, s.text, s.snippet);
      return `${i + 1}. **${s.title}** — ${excerpt}  \n   Source: ${s.url}`;
    })
    .join("\n\n");

  const nextActions = isOpportunity
    ? [
        "## Next actions for MALIK AI",
        "1. Open the first 3-5 sources and verify deadline, age rules, city, and application form.",
        "2. Pitch MALIK AI as: `AI command layer for building, automating, coding, designing, analyzing and launching projects`.",
        "3. If an opportunity is 18+, use an adult cofounder or representative.",
        "4. Save the links into `opportunities.md` and refresh daily.",
      ].join("\n")
    : [
        "## Next actions",
        "1. Open the primary source for the most important fact.",
        "2. Ask a narrower follow-up query if you need exact dates, prices, laws, or rules.",
        "3. Add a search API key in Render for more stable results.",
      ].join("\n");

  return [
    intro,
    "",
    "## Key findings",
    best,
    "",
    "## Source table",
    table,
    "",
    nextActions,
    "",
    `Search links found: **${allSources.length}**. Pages read: **${ranked.length}**.`,
  ].join("\n");
}
