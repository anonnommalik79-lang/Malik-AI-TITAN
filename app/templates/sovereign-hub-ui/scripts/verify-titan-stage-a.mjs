// TITAN Stage A — intelligence foundation, checked on the real modules.
//
//   npm run test:titan-stage-a
//
// 1. An answer the engine could not finish says so (reason, missing parts,
//    an unclosed code block) and the chat offers «Продолжить».
// 2. A continuation that re-sends part of the answer never duplicates it.
// 3. Big attachments share the context fairly: a second file is never pushed
//    out, the end of a file is never silently dropped, gaps are marked.
// 4. The server's final wording reaches the chat even after streaming, live
//    and through saved-turn recovery.
import assert from "node:assert/strict"
import fs from "node:fs"

const completion = await import("../lib/ai/answer-completion.ts")
const overlap = await import("../lib/ai/continuation-overlap.ts")
const documents = await import("../lib/ai/document-context.ts")
const followups = await import("../lib/ai/chat-followups.ts")
const recovery = await import("../lib/ai/chat-stream-recovery.ts")

let count = 0
let failures = 0
async function check(name, fn) {
  count += 1
  try {
    await fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}\n       ${String(error?.stack || error).split("\n").slice(0, 4).join("\n       ")}`)
  }
}

/* -------------------------------------------------- 1. honest completion */

await check("a finished answer is not flagged", () => {
  assert.equal(completion.assessAnswerCompletion("Полный ответ.", { interrupted: false, finishReason: "stop" }), null)
  assert.equal(completion.assessAnswerCompletion("```js\nx()\n```\nГотово.", { interrupted: false, finishReason: "stop", missing: [] }), null)
})

await check("only facts make an answer incomplete: cut stream, length stop, open fence, missing parts", () => {
  assert.equal(completion.assessAnswerCompletion("Часть", { interrupted: true }).reason, "interrupted")
  assert.equal(completion.assessAnswerCompletion("Часть", { interrupted: false, finishReason: "length" }).reason, "length")
  assert.equal(completion.assessAnswerCompletion("Часть", { interrupted: false, finishReason: "MAX_TOKENS" }).reason, "length")
  assert.equal(completion.assessAnswerCompletion("Часть", { interrupted: false, finishReason: "max_tokens" }).reason, "length")
  const fence = completion.assessAnswerCompletion("Код:\n```py\nprint(1)", { interrupted: false, finishReason: "stop" })
  assert.deepEqual(fence, { reason: "stalled", openFence: true })
  const missing = completion.assessAnswerCompletion("1. Первое", { interrupted: false, finishReason: "stop", missing: [2, 3, 0, -1, 2.5] })
  assert.deepEqual(missing, { reason: "stalled", missing: [2, 3] })
  assert.equal(completion.assessAnswerCompletion("Текст", { interrupted: false, finishReason: "stop", markerMissing: true }).reason, "stalled")
  // The engine's own stop reason wins over the generic one.
  assert.equal(completion.assessAnswerCompletion("Часть", { interrupted: false, finishReason: "length", stopReason: "time" }).reason, "time")
  // An engine stop reason alone, with nothing actually missing, is not a defect.
  assert.equal(completion.assessAnswerCompletion("Полный ответ.", { interrupted: false, finishReason: "stop", stopReason: "rounds" }), null)
})

await check("the note names the reason, the missing parts and the open code block", () => {
  const note = completion.incompleteNote({ reason: "budget", missing: [4, 5], openFence: true })
  assert.ok(note.startsWith(completion.INCOMPLETE_NOTE_START))
  assert.match(note, /лимит длины одного ответа/)
  assert.match(note, /не хватает пунктов: 4, 5/)
  assert.match(note, /блок кода не закрыт/)
  assert.match(note, /«Продолжить»/)
  for (const reason of ["time", "budget", "interrupted", "length", "stalled", "continuation-failed", "rounds"]) {
    assert.doesNotMatch(completion.incompleteNote({ reason }), /undefined/)
  }
})

await check("the note is added after closing an open code block, once", () => {
  const text = completion.withIncompleteNote("Пример:\n```js\nconst a = 1", { reason: "time", openFence: true })
  assert.equal(completion.hasOpenFence(text), false, "the fence is closed so the note is not inside the code")
  assert.match(text, /const a = 1\n```\n\n_Ответ не завершён: сервер остановил генерацию по лимиту времени; блок кода не закрыт\./)
  assert.equal(completion.withIncompleteNote(text, { reason: "time" }), text, "never added twice")
  assert.equal(completion.withIncompleteNote("Готово.", null), "Готово.")
})

await check("the note is for the person: stripped from history, recognised for «Продолжить»", () => {
  const text = completion.withIncompleteNote("Ответ до середины", { reason: "length" })
  assert.equal(completion.answerNeedsContinuation(text), true)
  assert.equal(completion.stripIncompleteNote(text), "Ответ до середины")
  const cut = "Ответ\n\n_Соединение прервалось — ответ может быть неполным. Нажмите «Продолжить», чтобы дописать, или «Перегенерировать», чтобы начать заново._"
  assert.equal(completion.answerNeedsContinuation(cut), true)
  assert.equal(completion.stripIncompleteNote(cut), "Ответ")
  // Quoting the phrase in the middle of an answer is not a status line.
  const quoted = "Если увидите «_Ответ не завершён: …_» в середине текста, это цитата.\n\nКонец ответа."
  assert.equal(completion.answerNeedsContinuation(quoted), false)
  assert.equal(completion.stripIncompleteNote(quoted), quoted)
})

await check("whitespace-only differences do not count as a rewritten answer", () => {
  assert.equal(completion.sameAnswerText("Ответ  с\nпробелами ", "Ответ с пробелами"), true)
  assert.equal(completion.sameAnswerText("Ответ", "⚠️ Ответ"), false)
})

await check("only the server's own finalisation may replace what streamed", () => {
  assert.equal(completion.answerRevises("Ставка 10", "⚠️ **Источники не подтверждены.**\n\nСтавка 10% для всех."), true)
  assert.equal(completion.answerRevises("Ответ до середины", "Ответ до середины\n\n_Ответ не завершён: модель упёрлась в лимит длины._"), true)
  const long = "Подробный ответ о налогах, ставках и вычетах. ".repeat(12)
  // The streamed tail may differ (a code block closed by the server).
  assert.equal(completion.answerRevises(`${long}\n\`\`\`js\nx()`, `⚠️ Проверка.\n\n${long}\n\`\`\`js\nx()\n\`\`\``), true)
  assert.equal(completion.answerRevises("User's result", "Someone else's result"), false)
  assert.equal(completion.answerRevises(long, "Совсем другой ответ на другой вопрос."), false)
})

await check("an incomplete answer offers «Продолжить» first and drops «Короче»/«Проще»", () => {
  const answer = completion.withIncompleteNote("Половина ответа", { reason: "length" })
  const chips = followups.buildContextualFollowUps("Расскажи подробно про налоги", answer)
  assert.equal(chips[0].label, "Продолжить")
  assert.equal(chips[0].text, completion.CONTINUE_PROMPT.ru.text)
  assert.ok(!chips.some((chip) => chip.label === "Короче" || chip.label === "Проще"))
  const en = followups.buildContextualFollowUps("Explain taxes in detail", completion.withIncompleteNote("Half", { reason: "time" }))
  assert.equal(en[0].label, "Continue")
  const done = followups.buildContextualFollowUps("Расскажи подробно про налоги", "Полный ответ.")
  assert.ok(!done.some((chip) => chip.label === "Продолжить"), "a finished answer gets no «Продолжить»")
  assert.ok(done.some((chip) => chip.label === "Короче"))
})

/* -------------------------------------------- 2. continuation overlap */

function run(previous, chunks, options) {
  let out = ""
  const filter = overlap.createContinuationFilter(previous, (text) => { out += text }, options)
  for (const chunk of chunks) filter.push(chunk)
  filter.end()
  return { out, dropped: filter.dropped }
}
const pieces = (text, size = 7) => text.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) || []

await check("a continuation that picks up exactly where it stopped passes unchanged", () => {
  const { out, dropped } = run("Первая часть ответа заканчивается здесь.", pieces(" Вторая часть продолжает мысль и завершает ответ."))
  assert.equal(out, " Вторая часть продолжает мысль и завершает ответ.")
  assert.equal(dropped, 0)
})

await check("a short re-sent seam is trimmed", () => {
  const { out } = run("Это предложение обрывается на середи", pieces("обрывается на середине и продолжается дальше."))
  assert.equal(out, "не и продолжается дальше.")
})

await check("a restart from far back (beyond 240 chars) is dropped up to the answer's end", () => {
  const body = "Раздел два рассказывает, как пакеты идут между сетями. ".repeat(3) + "Раздел три объясняет DNS: резолвер спрашивает корень, зону и авторитетный сервер, а ответ кешируется. "
  assert.ok(body.length > 240)
  const previous = `Раздел один вводит тему. ${body}`
  const { out, dropped } = run(previous, pieces(`${body}Раздел четыре подводит итог.`, 11))
  assert.equal(out, "Раздел четыре подводит итог.")
  assert.equal(dropped, body.length)
})

await check("text that only starts like the answer but diverges is new and kept whole", () => {
  const previous = "Итоги: выручка выросла на 12%, расходы снизились на 3%, прибыль удвоилась."
  const next = "Итоги: выручка выросла на 12%, но это не учитывает инфляцию и курс валют."
  const { out, dropped } = run(previous, pieces(next))
  assert.equal(out, next)
  assert.equal(dropped, 0)
})

await check("a continuation that only re-sends the answer's end adds nothing", () => {
  const previous = "Первый абзац. Второй абзац, который модель повторит целиком без изменений."
  const { out } = run(previous, pieces("Второй абзац, который модель повторит целиком без изменений."))
  assert.equal(out, "")
})

await check("a stream that ends while still matching the middle adds nothing", () => {
  const previous = "Начало ответа. Середина ответа с подробностями и цифрами. Конец ответа с выводами."
  const { out, dropped } = run(previous, pieces("Середина ответа с подробностями"))
  assert.equal(out, "")
  assert.ok(dropped > 0)
})

await check("very short heads fall back to the exact seam rule", () => {
  assert.equal(run("Ответ", ["ok"]).out, "ok")
  assert.equal(run("", pieces("Новый ответ без предыдущего.")).out, "Новый ответ без предыдущего.")
})

/* -------------------------------------------- 3. big documents, fairly */

const filler = (word, chars) => {
  let text = ""
  let index = 0
  while (text.length < chars) text += `${word} строка номер ${index++} без особого содержания, просто текст отчёта.\n\n`
  return text
}

await check("fair shares: small parts keep everything, big ones split the rest", () => {
  assert.deepEqual(documents.fairShares([100, 100], 1000), [100, 100])
  assert.deepEqual(documents.fairShares([100, 5000, 5000], 2100), [100, 1000, 1000])
  const shares = documents.fairShares([300_000, 20_000], 150_000)
  assert.equal(shares[1], 20_000, "a small second file is kept whole")
  assert.equal(shares[0], 130_000)
})

await check("everything that fits is passed unchanged, with labels", () => {
  const result = documents.fitDocumentContext([{ label: "a.txt", text: "Альфа" }, { label: "b.txt", text: "Бета" }], "Сравни", 10_000)
  assert.equal(result.truncated, false)
  assert.equal(result.text, "[a.txt]\nАльфа\n\n[b.txt]\nБета")
})

await check("«Сравни два больших документа»: both are present, each with its start and end", () => {
  const first = `НАЧАЛО-ПЕРВОГО договор аренды.\n\n${filler("Аренда", 400_000)}КОНЕЦ-ПЕРВОГО итоговая сумма 1 200 000.`
  const second = `НАЧАЛО-ВТОРОГО договор поставки.\n\n${filler("Поставка", 400_000)}КОНЕЦ-ВТОРОГО итоговая сумма 950 000.`
  const budget = 178_000
  const result = documents.fitDocumentContext([{ label: "аренда.docx", text: first }, { label: "поставка.docx", text: second }], "Сравни два больших документа", budget)
  assert.equal(result.truncated, true)
  assert.ok(result.text.length <= budget, `context ${result.text.length} must stay within the budget ${budget}`)
  for (const marker of ["НАЧАЛО-ПЕРВОГО", "КОНЕЦ-ПЕРВОГО", "НАЧАЛО-ВТОРОГО", "КОНЕЦ-ВТОРОГО"]) assert.ok(result.text.includes(marker), `${marker} must be in the context`)
  const [a, b] = result.documents
  assert.ok(Math.abs(a.shown - b.shown) < 6_000, `shares must be fair (${a.shown} vs ${b.shown})`)
  assert.match(result.text, /^\[MALIK_DOCUMENT_EXCERPTS\]/)
  assert.match(result.text, /Не утверждай ничего о пропущенных частях/)
  assert.match(result.text, /\[… пропущено ≈[\d\s ]+ символов/)
})

await check("many files and long names: every file keeps its start and end, the total stays in budget", () => {
  const parts = Array.from({ length: 120 }, (_, index) => ({
    label: `${"очень-длинное-имя-файла-".repeat(4)}${index}.txt`,
    text: `СТАРТ-${index} ${filler(`Файл${index}`, 6_000)} ФИНИШ-${index}`,
  }))
  const budget = 178_000
  const result = documents.fitDocumentContext(parts, "Сравни все файлы", budget)
  assert.ok(result.text.length <= budget, `context ${result.text.length} must stay within ${budget}`)
  for (let index = 0; index < parts.length; index++) {
    assert.ok(result.text.includes(`СТАРТ-${index} `), `file ${index} must keep its start`)
    assert.ok(result.text.includes(` ФИНИШ-${index}`), `file ${index} must keep its end`)
  }
})

await check("the paragraph the question is about survives the cut", () => {
  const needle = "Штраф за просрочку платежа составляет 0,5% в день от суммы задолженности."
  const text = `${filler("Общее", 150_000)}${needle}\n\n${filler("Общее", 150_000)}`
  const result = documents.fitDocument(text, "Какой штраф за просрочку платежа?", 30_000)
  assert.ok(result.text.includes(needle), "the relevant paragraph must be kept")
  assert.ok(result.shown <= 30_000)
  assert.ok(result.omittedRanges >= 1)
})

await check("without specific words the file is sampled evenly, not just its head", () => {
  const parts = Array.from({ length: 10 }, (_, index) => `МЕТКА-${index}\n\n${filler(`Блок${index}`, 30_000)}`)
  const result = documents.fitDocument(parts.join(""), "Проанализируй", 60_000)
  const seen = parts.map((_, index) => result.text.includes(`Блок${index} строка`)).filter(Boolean).length
  assert.ok(seen >= 6, `parts from across the file must be present (saw ${seen}/10)`)
})

await check("question terms ignore filler words and meet word forms", () => {
  const terms = documents.questionTerms("Сравни, пожалуйста, налоговые ставки и налогами в документе")
  assert.ok(terms.includes("налого"))
  assert.ok(!terms.includes("сравни") && !terms.includes("пожалу"))
})

await check("the multimodal router uses the fair fitting instead of a hard cut", () => {
  const source = fs.readFileSync("lib/server/multimodal-router.ts", "utf8")
  assert.match(source, /fitDocumentContext\(textSections, input\.prompt, MAX_FILE_CONTEXT_CHARS - 2_000\)/)
  assert.match(source, /MAX_FILE_READ_CHARS = 1_200_000/)
})

/* -------------------------------------- 4. the server's final wording */

const encoder = new TextEncoder()
const event = (type, rest = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...rest })}\n\n`
function timedSse(parts, headers = {}) {
  return new Response(new ReadableStream({
    async start(controller) {
      for (const [delay, text] of parts) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        if (text === null) { controller.error(new TypeError("network error")); return }
        controller.enqueue(encoder.encode(text))
      }
      controller.close()
    },
  }), { headers: { "content-type": "text/event-stream", ...headers } })
}
const request = { method: "POST", body: JSON.stringify({ originalQuestion: "Объясни налоги", workspaceMode: "chat" }) }
const TURN = "6f1f8a8e-3c2b-4b7a-9f0e-0a1b2c3d4e5f"

await check("a live done with finalContent is passed to the chat as is", async () => {
  const response = await recovery.fetchRecoverableChat("/api/stream", request, {
    idleMs: 2_000, firstTextMs: 5_000, recoveryMs: 500, pollMs: 5,
    fetcher: async () => timedSse([[5, event("content", { content: "Ставка 10%." })], [5, event("done", { finalContent: "⚠️ Ставка 10% (проверьте актуальность)." })]]),
  })
  const text = await response.text()
  assert.match(text, /"finalContent":"⚠️ Ставка 10% \(проверьте актуальность\)\."/)
  assert.doesNotMatch(text, /event: error/)
})

await check("a saved turn the server rewrote is recovered, not rejected as a mismatch", async () => {
  let polls = 0
  const response = await recovery.fetchRecoverableChat("/api/stream", request, {
    idleMs: 400, firstTextMs: 5_000, recoveryMs: 5_000, pollMs: 5,
    fetcher: async (url) => {
      if (url === "/api/stream") return timedSse([[5, event("content", { content: "Ставка 10" })], [10, null]], { "x-malik-background-turn-id": TURN })
      polls += 1
      return Response.json({ ok: true, turn: { status: "complete", content: "⚠️ Ставка 10% — проверьте по закону.", sources: [] } })
    },
  })
  const text = await response.text()
  assert.ok(polls >= 1)
  assert.match(text, /"finalContent":"⚠️ Ставка 10% — проверьте по закону\."/)
  assert.doesNotMatch(text, /event: error/)
})

await check("a saved turn that extends what streamed still arrives as a snapshot", async () => {
  const response = await recovery.fetchRecoverableChat("/api/stream", request, {
    idleMs: 400, firstTextMs: 5_000, recoveryMs: 5_000, pollMs: 5,
    fetcher: async (url) => {
      if (url === "/api/stream") return timedSse([[5, event("content", { content: "Ставка 10" })], [10, null]], { "x-malik-background-turn-id": TURN })
      return Response.json({ ok: true, turn: { status: "complete", content: "Ставка 10% для всех.", sources: [] } })
    },
  })
  const text = await response.text()
  assert.match(text, /"content":"Ставка 10% для всех\.","contentMode":"snapshot"/)
  assert.doesNotMatch(text, /finalContent/)
})

await check("the stream route, background store and chat all carry the final wording", () => {
  const route = fs.readFileSync("app/api/stream/route-impl.ts", "utf8")
  assert.match(route, /withIncompleteNote\(asPlainText\(answer\), incomplete\)/)
  assert.match(route, /!sameAnswerText\(streamedText, authoritative\)/)
  assert.match(route, /finalContent !== undefined \? \{ finalContent \} : \{\}/)
  const background = fs.readFileSync("app/api/stream/background/route.ts", "utf8")
  assert.match(background, /payload\.finalContent\.length <= MAX_CHAT_RESULT_CHARS\) state\.content = payload\.finalContent/)
  const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
  assert.match(dashboard, /typeof payload\?\.finalContent === "string"/)
  assert.match(dashboard, /stripIncompleteNote/)
  const engine = fs.readFileSync("lib/server/malik-max-engine.ts", "utf8")
  assert.match(engine, /createContinuationFilter\(content, emit\)/)
  assert.match(engine, /assessAnswerCompletion\(content, \{/)
})

console.log(failures ? `\n${failures}/${count} checks FAILED` : `\n${count}/${count} checks passed`)
if (failures) process.exit(1)
