import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { attributionKind, attributionSystemInstruction, gateAttributionAnswer } from "../lib/ai/attribution-evidence.ts"
import { shouldUseWeb } from "../lib/ai/web-search-policy.ts"

const factQuestion = "а кто глава тяпляпа"
const foundedQuestion = "когда была основана тяпляп"
assert.equal(attributionKind(factQuestion), "identity")
assert.equal(attributionKind(foundedQuestion), "founding-date")
assert.equal(attributionKind("кто основал группировку?"), "identity")
assert.equal(attributionKind("в каком году появилась эта организация?"), "founding-date")
assert.equal(attributionKind("when was this group founded?"), "founding-date")
assert.equal(attributionKind("когда умер этот политик?"), "biographical-date")
assert.equal(attributionKind("переведи: кто основал компанию"), null)
assert.equal(attributionKind("напиши рассказ про основателя организации"), null)
assert.equal(attributionKind("создай сайт о биографии"), null)
assert.equal(attributionKind("напиши статью про основателя корпорации"), null)
assert.equal(attributionKind("посчитай 2+2"), null)
assert.match(attributionSystemInstruction(factQuestion), /PERSON, ROLE, ORGANIZATION and DATE/)

assert.equal(shouldUseWeb(factQuestion), true, "Identity should not skip search")
assert.equal(shouldUseWeb(foundedQuestion), true, "Historical dates should not skip search")
assert.equal(shouldUseWeb(factQuestion, { research: false }), false, "Respect web opt-out")
assert.equal(shouldUseWeb("кто глава тяпляпа без интернета"), false, "Explicit no-web")
assert.equal(shouldUseWeb("переведи: кто глава тяпляпа"), false, "Translation not research")
assert.equal(shouldUseWeb("напиши рассказ про главу тяпляпа"), false, "Fiction not research")
assert.equal(shouldUseWeb("посчитай 5 + 2"), false, "Arithmetic stays offline")

const sources = [
  {
    url: "https://independent-history.example/articles/one",
    title: "История казанской группировки",
    snippet: "Сергей Антипов основал эту группировку в 1974 году. Создание относится к началу 1970-х.",
  },
  {
    url: "https://regional-archive.example/history/two",
    title: "Группировка и её основатели",
    snippet: "В 1974 году основателем группировки был Сергей Антипов, которого называют одним из организаторов.",
  },
]
const pass = (question, answer, refs = sources) => gateAttributionAnswer({
  question, answer, sources: refs, searchEnabled: true,
})
assert.equal(pass(factQuestion, "Её основателем был Сергей Антипов.").withheld, false)
assert.equal(pass(foundedQuestion, "Организация была основана в 1974 году.").withheld, false)
assert.equal(pass(factQuestion, "Её основателем был Анвар Халиуллин.").withheld, true)
assert.equal(pass(factQuestion, "Её основателем был Сергей Антипов. Он погиб в 1994 году.").withheld, true)
const conflictingSourcePages = [
  { url: "https://one.example/story", title: "Группировка", snippet: "Анвар Халиуллин не был основателем группы. Её создал Сергей Антипов в 1974 году." },
  { url: "https://two.example/story", title: "История группировки", snippet: "Анвар Халиуллин не был главой группы. Основателем был Сергей Антипов в 1974 году." },
]
assert.equal(pass(factQuestion, "Основателем был Анвар Халиуллин.", conflictingSourcePages).withheld, true, "A negated statement is not support")
const dateForDifferentPerson = [
  { url: "https://history-one.example/group", title: "История группировки", snippet: "Сергей Антипов основал группировку в 1974 году. Другой её участник был убит в 1994 году." },
  { url: "https://history-two.example/group", title: "История и даты", snippet: "В 1974 году Сергей Антипов создал банду. Другой руководитель погиб в 1994 году." },
]
assert.equal(pass(factQuestion, "Сергей Антипов погиб в 1994 году.", dateForDifferentPerson).withheld, true, "A nearby death date of another person must not be reassigned")
assert.equal(pass(foundedQuestion, "Организация была основана в 1988 году.").withheld, true)
assert.equal(pass(foundedQuestion, "Организация появилась в конце 1980-х.").withheld, true)
assert.equal(pass(factQuestion, "Создателем был некий Халиуллин.").withheld, true)
assert.equal(pass(factQuestion, "Считается, что главным был Анвар Халиуллин.", sources.slice(0, 1)).withheld, true)
assert.equal(pass(factQuestion, "Её основателем был Сергей Антипов.", [sources[0], { ...sources[0], url: "https://independent-history.example/duplicate" }]).withheld, true)
assert.equal(pass(factQuestion, "Не удалось подтвердить имя руководителя.").withheld, false)

const off = gateAttributionAnswer({ question: factQuestion, answer: "Анвар Халиуллин", sources, searchEnabled: false })
assert.equal(off.withheld, true)
assert.match(off.content, /поиск отключён/)
assert.equal(pass(factQuestion, "Имя выдумано", []).withheld, true)
const generic = pass("как работает React?", "React — библиотека", [])
assert.equal(generic.withheld, false, "Non-sensitive questions must not be censored")

const router = readFileSync(new URL("../lib/malik-god-router.ts", import.meta.url), "utf8")
const policy = readFileSync(new URL("../lib/ai/web-search-policy.ts", import.meta.url), "utf8")
assert.match(router, /onToken: \(attribution \|\| needsCurrentEvidence/)
assert.match(router, /gateAttributionAnswer\(\{ question: focus\.searchText/)
assert.match(router, /legacyAttribution && !usedWeb/)
assert.match(policy, /if \(attributionKind\(text\)\) return true/)

console.log("MALIK historical attribution evidence gate PASS")
