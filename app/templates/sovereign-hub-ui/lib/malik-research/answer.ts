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
