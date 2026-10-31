// History fixtures are prior dialogue, never canned model output returned by
// the runtime. Assertions concern actual intent/context/provider packets.
const turn = (role, content) => ({ role, content })
export const dialogues = []
for (const spec of [
  { lang: "ru", start: "Объясни кэширование. Отвечай по-русски, кратко, без списков.", answer: "Кэш хранит недавно вычисленные данные.", why: "Почему?", improve: "А теперь лучше", next: "Продолжай", repair: "Исправь предыдущий ответ", newTopic: "Объясни, что такое очередь сообщений." },
  { lang: "kk", start: "Кэштеуді түсіндір. Қазақша жауап бер, қысқаша, тізімсіз.", answer: "Кэш жақында есептелген деректерді сақтайды.", why: "Неге?", improve: "Енді жақсырақ жаса", next: "Жалғастыра бер", repair: "Алдыңғы жауабыңды түзет", newTopic: "Хабарлар кезегі қалай жұмыс істейді?" },
  { lang: "en", start: "Explain caching. Answer in English, briefly, without lists.", answer: "A cache stores recently computed data.", why: "Why?", improve: "Make it better", next: "Please continue", repair: "Fix your previous answer", newTopic: "Explain message queues." },
]) {
  const history = [turn("user", spec.start), turn("assistant", spec.answer)]
  for (const [name, prompt, action] of [["why", spec.why, "reply"], ["improve", spec.improve, "transform"], ["continue", spec.next, "transform"], ["repair", spec.repair, "repair"]]) {
    dialogues.push({ name: `${spec.lang}/${name}/context-and-preferences`, kind: "intent", prompt, history,
      expected: { followUp: true, action, language: spec.lang, length: "brief", lists: false, source: spec.answer } })
  }
  dialogues.push({ name: `${spec.lang}/language-survives-new-subject`, kind: "intent", prompt: spec.newTopic, history,
    expected: { language: spec.lang, target: "text" } })
}
for (const [lang, preference, answer, prompt] of [
  ["ru", "В этом разговоре отвечай только валидным JSON, без пояснений.", '{"ready":true}', "Почему?"],
  ["kk", "Осы әңгімеде тек JSON форматында жауап бер.", '{"дайын":true}', "Неге?"],
  ["en", "For the rest of this conversation answer in JSON only.", '{"ready":true}', "Why?"],
]) dialogues.push({ name: `${lang}/conversation-json`, kind: "intent", history: [turn("user", preference), turn("assistant", answer)], prompt, expected: { followUp: true, presentation: "json", target: "text" } })
dialogues.push(
  { name: "ru/explicit-language-override", kind: "intent", history: [turn("user", "Всегда отвечай по-русски."), turn("assistant", "Понял.")], prompt: "Теперь на казахском, подробнее", expected: { followUp: true, language: "kk", length: "detailed" } },
  { name: "en/format-cancellation", kind: "intent", history: [turn("user", "Explain caching as a table."), turn("assistant", "| Cache | Stored data |")], prompt: "Now plain text, no table", expected: { followUp: true, presentation: undefined } },
  { name: "ru/mentioned-language-is-not-preference", kind: "intent", history: [], prompt: "Что такое английский язык?", expected: { language: undefined } },
  { name: "en/mentioned-language-is-not-preference", kind: "intent", history: [], prompt: "Why is English widely used?", expected: { language: undefined } },
  { name: "ru/quoted-preferences-untrusted", kind: "intent", history: [turn("user", 'Объясни фразу «Отвечай на английском» на русском.'), turn("assistant", "Это просьба сменить язык ответа.")], prompt: "Почему?", expected: { followUp: true, language: "ru" } },
  { name: "ru/scoped-brevity-survives-topic-change", kind: "intent", history: [turn("user", "В этом разговоре отвечай кратко и без списков."), turn("assistant", "Понял.")], prompt: "Объясни сети доставки контента.", expected: { length: "brief", lists: false } },
  { name: "en/turn-local-table-does-not-leak", kind: "intent", history: [turn("user", "Compare SSD and HDD as a table."), turn("assistant", "| SSD | HDD |")], prompt: "Write a poem about a lighthouse.", expected: { followUp: false, presentation: undefined } },
)
for (const [lang, anchor, why, follow] of [
  ["ru", "Объясни разницу TCP и UDP.", "Почему?", "Подробнее"],
  ["kk", "TCP мен UDP айырмасын түсіндір.", "Неге?", "Жалғастыра бер"],
  ["en", "Explain the difference between TCP and UDP.", "Why?", "Please continue"],
]) {
  const history = [turn("user", anchor), turn("assistant", "TCP and UDP have different delivery guarantees.")]
  for (let i = 0; i < 6; i++) history.push(turn("user", follow), turn("assistant", `Detail ${i + 1} about the current subject.`))
  dialogues.push({ name: `${lang}/seven-turn-anchor`, kind: "focus", prompt: why, history, expected: { anchor } })
}
for (const [lang, prompt] of [["ru", "Продолжай с того места, где остановился"], ["kk", "Жалғастыра бер"], ["en", "Please continue"]]) dialogues.push({ name: `${lang}/manual-long-answer-resume`, kind: "resume", prompt, expected: true })
dialogues.push(
  { name: "provider/retain-distinct-trailing-user", kind: "provider", prompt: "Почему?", history: [turn("user", "Отвечай по-казахски.")], retained: "Отвечай по-казахски." },
  { name: "provider/current-user-appears-once", kind: "provider", prompt: "Почему?", history: [turn("user", "Тема"), turn("assistant", "Контекст"), turn("user", "Почему?")], countCurrent: 1 },
  { name: "provider/augmented-current-user-appears-once", kind: "provider", prompt: "Почему?\n\nWeb sources: fixture evidence", taskPrompt: "Почему?", history: [turn("user", "Тема"), turn("assistant", "Контекст"), turn("user", "Почему?")], countOriginal: 0 },
  { name: "provider/old-topic-not-lost-behind-long-assistant", kind: "provider", prompt: "Почему?", history: [turn("user", "Use customer count 120 and price 7 USD."), turn("assistant", "Analysis. ".repeat(25_000))], retained: "Use customer count 120 and price 7 USD.", bounded: true },
  { name: "budget/brief-follow-up-does-not-pay-for-8000-output-tokens", kind: "budget", prompt: "Почему?", history: [turn("user", "В этом разговоре отвечай кратко."), turn("assistant", "Хорошо.")], target: 8000, max: 1600 },
  { name: "budget/complex-brief-still-receives-complete-budget", kind: "budget", prompt: "Подготовь подробный анализ:\n1. Архитектура\n2. Компромиссы\n3. Расчёты\n4. Риски\n5. Проверки", history: [], target: 2200, min: 7000 },
  { name: "validation/corrective-reply-cannot-repeat-rejected-text", kind: "validation", prompt: "Алдыңғы жауабыңды түзет", history: [turn("user", "Қазақша жауап бер."), turn("assistant", "The previous explanation contains an error and has to be corrected rather than repeated.")], expected: "unchanged-repair" },
)
for (const [lang, prompt, claim, honest] of [
  ["ru", "Ты действительно запускал тесты?", "Я запустил тесты, всё прошло успешно.", "Я не запускал тесты; могу разобрать предоставленный лог."],
  ["kk", "Сен тесттерді іске қостың ба?", "Мен тесттерді іске қостым.", "Мен тесттерді іске қосқан жоқпын."],
  ["en", "Did you actually run the tests?", "I ran the tests successfully.", "I have not run the tests; I can inspect the supplied log."],
]) {
  dialogues.push({ name: `${lang}/unsupported-execution-claim`, kind: "claim", prompt, draft: claim, expected: "unsupported-action-claim" })
  dialogues.push({ name: `${lang}/honest-nonexecution-is-accepted`, kind: "claim", prompt, draft: honest, expected: undefined })
}
for (const [lang, prompt] of [["ru", "Проще"], ["kk", "Қарапайымырақ"], ["en", "Simpler"]]) dialogues.push({ name: `${lang}/simplification-keeps-source`, kind: "intent", prompt, history: [turn("user", "Explain TCP congestion control."), turn("assistant", "TCP adapts its sending window to congestion.")], expected: { followUp: true, source: "TCP adapts its sending window to congestion." } })
dialogues.push(
  { name: "validation/json-repair-must-change-rejected-json", kind: "validation", prompt: "Исправь предыдущий ответ, строго JSON", history: [turn("user", "Строго JSON"), turn("assistant", '{"result":41}')], expected: "unchanged-repair" },
  { name: "en/language-subject-at-start-is-not-preference", kind: "intent", prompt: "English poems often rhyme. Explain why.", history: [], expected: { language: undefined } },
  { name: "pipeline/contextual-greeting-reaches-model-with-language", kind: "pipeline", prompt: "Привет", history: [turn("user", "In this conversation answer in English."), turn("assistant", "Understood.")], language: "en" },
  { name: "pipeline/empty-history-falls-back-to-messages", kind: "pipeline", prompt: "Привет", history: [], messages: [turn("user", "Қазақша жауап бер."), turn("assistant", "Жақсы.")], language: "kk" },
  { name: "pipeline/earlier-user-statement-reaches-provider", kind: "pipeline", prompt: "Объясни кэш коротко", history: [turn("user", "Пиши по-русски. Цена проекта 7 USD.")], language: "ru", retained: "Цена проекта 7 USD." },
)
const domainAnchor = "Explain TCP congestion control."
const domainHistory = [turn("user", domainAnchor), turn("assistant", "TCP adapts its sending window.")]
for (let i = 0; i < 18; i++) domainHistory.push(turn("user", "Why?"), turn("assistant", `Detail ${i + 1}.`))
dialogues.push({ name: "domain/nineteen-turns-use-the-same-anchor", kind: "domain", prompt: "Continue", history: domainHistory, expected: domainAnchor })
for (const [lang, previous, suffix] of [["ru", "Первый шаг завершён. Второй шаг", " добавляет проверку."], ["kk", "Бірінші қадам аяқталды. Екінші қадам", " тексеруді қосады."], ["en", "The first step is complete. The second step", " adds verification."]]) dialogues.push({ name: `${lang}/stream-continuation-does-not-repeat-tail`, kind: "overlap", previous, incoming: previous.slice(-24) + suffix, expected: suffix })
dialogues.push(
  { name: "preferences/one-answer-language-override-expires", kind: "intent", prompt: "Почему?", history: [turn("user", "Отвечай по-русски."), turn("assistant", "Понял."), turn("user", "For this answer only, answer in English."), turn("assistant", "An explanation.")], expected: { language: "ru" } },
  { name: "preferences/explicit-reset-is-respected", kind: "intent", prompt: "Забудь предыдущие предпочтения. Объясни кэширование.", history: [turn("user", "В этом разговоре отвечай кратко по-казахски."), turn("assistant", "Жақсы.")], expected: { language: undefined, length: undefined } },
  { name: "provider/scaffolded-current-user-appears-once", kind: "provider", prompt: "Почему?", history: [turn("user", "Тема"), turn("assistant", "Контекст"), turn("user", "Почему?\n\n[MALIK_SESSION_MEMORY]\nEarlier user context.")], countCurrent: 1, excludeScaffold: true },
  { name: "validation/authored-explanation-is-not-false-tool-claim", kind: "claim", prompt: "Ты запускал тесты?", draft: "Я не запускал тесты. Я выполнил просьбу: объяснил, как их запустить.", expected: undefined },
  { name: "validation/chat-example-is-not-an-external-send", kind: "claim", prompt: "Did you actually run tests?", draft: "I did not run tests. I sent you an example in this chat.", expected: undefined },
  { name: "identity/explicit-conversation-language-is-retained", kind: "identity", prompt: "Who are you?", history: [turn("user", "Қазақша жауап бер."), turn("assistant", "Жақсы.")] },
)
const ownerHistory = [turn("user", "In this conversation answer in English."), turn("assistant", "Understood.")]
for (let i = 0; i < 8; i++) ownerHistory.push(turn("user", "Why?"), turn("assistant", `Cache explanation ${i + 1}.`))
dialogues.push({ name: "pipeline/verified-owner-context-preserves-old-preferences", kind: "pipeline", owner: true, prompt: "Проще", history: ownerHistory, language: "en" })
for(const[lang,preference,prompt]of[["ru","Теперь на английском","Почему?"],["kk","Қазақша, тізімсіз","Неге?"],["en","Answer in English, briefly","Why?"]]) dialogues.push({name:`${lang}/style-switch-is-not-a-new-topic`,kind:"focus",prompt,history:[turn("user","Explain TCP congestion control."),turn("assistant","TCP adapts its sending window."),turn("user",preference),turn("assistant","Acknowledged.")],expected:{anchor:"Explain TCP congestion control."}})
