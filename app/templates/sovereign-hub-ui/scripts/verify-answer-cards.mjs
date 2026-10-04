import assert from "node:assert/strict"
import fs from "node:fs"
import { answerCardsToText, parseAnswerCards } from "../lib/ai/answer-cards.ts"
import { trustedLink } from "../lib/ai/citation-names.ts"
import { extractPageImage } from "../lib/malik-research/fetch-page.ts"
import { buildMalikResponseSystemPrompt } from "../lib/ai/response-intelligence.ts"

/**
 * Answer cards as ChatGPT shows them - pictures from the cited pages, names
 * that open official pages, badges, key figures, dates and buttons - and the
 * rules that keep them honest: links only to sites the sources are on,
 * pictures only from those pages or the reference catalogue, figures and [n]
 * markers audited like the rest of the answer.
 */

let failures = 0
function check(name, fn) {
  try { fn(); console.log(`  ok  ${name}`) } catch (error) { failures += 1; console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`) }
}

const sources = [
  { url: "https://astanahub.com/ru/event/alem-battle", domain: "astanahub.com" },
  { url: "https://www.gitex.com/kazakhstan", domain: "gitex.com" },
]

check("a card block is validated field by field; [n] in text become its sources", () => {
  const block = parseAnswerCards(JSON.stringify({ version: 1, type: "cards", items: [
    { title: "Grand Final alem.ai Battle", url: "https://astanahub.com/x", image: 1, badge: "Ближайшее", meta: "23 октября 2026 · Астана", text: "Финал [1][2].", sources: [1], links: [{ label: "Регистрация", url: "javascript:alert(1)" }] },
    { title: "" },
    { title: "<b>Expand</b> North Star", image: "Dubai World Trade Centre", imageRole: "logo" },
  ] }))
  assert.equal(block.type, "cards")
  assert.equal(block.items.length, 2)
  assert.deepEqual(block.items[0].sources, [1, 2])
  assert.equal(block.items[0].text, "Финал.")
  assert.equal(block.items[0].links, undefined, "a javascript: link is dropped")
  assert.equal(block.items[1].title, "Expand North Star")
  assert.equal(block.items[1].image, "Dubai World Trade Centre")
  assert.equal(block.items[1].imageRole, "logo")
})

check("malformed, partial, unknown or oversized blocks render nothing", () => {
  for (const json of ["{", "{\"version\":2,\"type\":\"cards\",\"items\":[{\"title\":\"x\"}]}", "{\"version\":1,\"type\":\"popup\"}", "{\"version\":1,\"type\":\"dates\",\"items\":[{\"label\":\"a\",\"value\":\"b\"}]}", "x".repeat(25_000)]) {
    assert.equal(parseAnswerCards(json), null, json.slice(0, 40))
  }
})

check("links are kept only for sites the sources are on; without sources only front pages", () => {
  assert.equal(trustedLink("https://astanahub.com/ru/apply", sources), "https://astanahub.com/ru/apply")
  assert.equal(trustedLink("https://events.astanahub.com/battle", sources), "https://events.astanahub.com/battle")
  assert.equal(trustedLink("https://gitex.com/supernova", sources), "https://gitex.com/supernova")
  assert.equal(trustedLink("https://invented.example/apply", sources), "")
  assert.equal(trustedLink("javascript:alert(1)", sources), "")
  assert.equal(trustedLink("https://user:pass@astanahub.com/", sources), "")
  assert.equal(trustedLink("https://www.python.org/", []), "https://www.python.org/")
  assert.equal(trustedLink("https://www.python.org/made/up", []), "")
})

check("copying or reading an answer gets the cards as text, with their [n] for the audit", () => {
  const answer = "До.\n\n```malik-cards\n" + JSON.stringify({ version: 1, type: "options", items: [{ title: "Activat VC", value: "$30 млн", text: "Ранние стадии.", sources: [2], action: { label: "Подать заявку", url: "https://activat.vc/apply" } }] }) + "\n```\n\nПосле."
  const text = answerCardsToText(answer)
  assert.match(text, /\*\*Activat VC\*\*/)
  assert.match(text, /\$30 млн/)
  assert.match(text, /Ранние стадии\. \[2\]/)
  assert.match(text, /Подать заявку: https:\/\/activat\.vc\/apply/)
  assert.doesNotMatch(text, /malik-cards|"version"/)
  assert.match(text, /^До\./)
  assert.match(text, /После\.$/)
})

check("a page's own picture is read from og:image, twitter:image or image_src", () => {
  assert.equal(extractPageImage('<meta property="og:image" content="/media/a.jpg">', "https://astanahub.com/event"), "https://astanahub.com/media/a.jpg")
  assert.equal(extractPageImage('<meta content="https://cdn.gitex.com/og.png" property="og:image">', "https://gitex.com/"), "https://cdn.gitex.com/og.png")
  assert.equal(extractPageImage('<meta name="twitter:image" content="https://x.kz/t.jpg?a=1&amp;b=2">', "https://x.kz/"), "https://x.kz/t.jpg?a=1&b=2")
  assert.equal(extractPageImage('<meta property="og:image" content="http://insecure.kz/a.jpg">', "https://x.kz/"), undefined)
  assert.equal(extractPageImage('<meta property="og:image" content="https://x.kz/pixel.gif">', "https://x.kz/"), undefined)
  assert.equal(extractPageImage("<title>no picture</title>", "https://x.kz/"), undefined)
})

check("the model is asked for cards in web answers, overviews and comparisons - not in code or small talk", () => {
  assert.match(buildMalikResponseSystemPrompt({ prompt: "куда подать стартап на инвестиции в Казахстане", usedWeb: true, hasWebEvidence: true }), /ANSWER CARDS/)
  assert.match(buildMalikResponseSystemPrompt({ prompt: "сравни iphone 17 и samsung s25" }), /ANSWER CARDS/)
  assert.match(buildMalikResponseSystemPrompt({ prompt: "какой ноутбук купить для учебы" }), /ANSWER CARDS/)
  for (const prompt of ["привет", "напиши функцию на python", "Что такое рендер?"]) {
    assert.doesNotMatch(buildMalikResponseSystemPrompt({ prompt }), /ANSWER CARDS/, prompt)
  }
  const contract = buildMalikResponseSystemPrompt({ prompt: "события для стартапов", usedWeb: true })
  assert.match(contract, /never invent or guess a link, date, price, prize or status/)
})

check("wiring: page pictures reach the model, the client and the audit", () => {
  const router = fs.readFileSync("lib/malik-god-router.ts", "utf8")
  assert.match(router, /Page picture: available/)
  assert.match(router, /\.\.\.\(page\.image \? \{ image: page\.image \} : \{\}\)/)
  assert.match(router, /auditGroundedAnswer\(answerCardsToText\(content\)/)
  assert.match(fs.readFileSync("lib/malik-research/fetch-page.ts", "utf8"), /const image = extractPageImage\(html, target\)/)
  assert.match(fs.readFileSync("components/sovereign/dashboard.tsx", "utf8"), /image: typeof value\?\.image === "string" && \/\^https:/)
  const view = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
  assert.match(view, /stripAnswerPhotoHints\(answerCardsToText\(displayContent\)\)/)
  assert.match(fs.readFileSync("components/sovereign/MalikMarkdown.tsx", "utf8"), /fence\.language === "malik-cards"/)
})

console.log(failures ? `\n${failures} failing\n` : "\nall answer-card checks passed\n")
process.exit(failures ? 1 : 0)
