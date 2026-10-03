/** Pure, testable contextual quick actions for the Malik AI chat. */
export type FollowUp = { label: string; text: string; research?: boolean }
export type FollowUpContext = { hasAttachment?: boolean }
export type FollowUpSendOptions = { research?: boolean }

type FollowUpLocale = "ru" | "kk" | "en"
function followUpLocale(question: string): FollowUpLocale {
  if (/[әіңғүұқөһі]/iu.test(question)) return "kk"
  if (/[а-яё]/iu.test(question)) return "ru"
  return "en"
}

/** Action chips are contextual, translated, and never pretend an action ran.
 * Research is explicitly forwarded to the existing server-side search path. */
export function buildContextualFollowUps(question: string, answer: string, context: FollowUpContext = {}): FollowUp[] {
  const locale = followUpLocale(question || answer)
  const copy: Record<FollowUpLocale, Record<string, FollowUp>> = {
    ru: {
      more: { label: "Подробнее", text: "Объясни свой предыдущий ответ подробнее, с конкретными деталями." },
      short: { label: "Короче", text: "Сократи предыдущий ответ до 3–5 главных пунктов без потери смысла." },
      simple: { label: "Проще", text: "Объясни предыдущий ответ простыми словами, без лишнего жаргона." },
      example: { label: "Пример", text: "Покажи конкретный практический пример по предыдущему ответу." },
      steps: { label: "Пошагово", text: "Преврати предыдущий ответ в проверяемую пошаговую инструкцию. Не придумывай расположение элементов интерфейса." },
      code: { label: "Проверь код", text: "Проверь код из предыдущего ответа на ошибки и безопасность; предложи исправленный вариант и объясни изменения." },
      math: { label: "Проверь расчёт", text: "Независимо перепроверь все вычисления предыдущего ответа с подстановкой и единицами измерения." },
      table: { label: "Таблицей", text: "Структурируй предыдущий ответ в понятную сравнительную таблицу, сохранив факты и ограничения." },
      fact: { label: "Проверить факты", text: "Проверь ключевые проверяемые факты из предыдущего ответа по доступным актуальным источникам, укажи ссылки и что не удалось подтвердить.", research: true },
      attachment: { label: "Разобрать файл", text: "Вернись к вложению из предыдущего запроса. Разбери его содержание подробно, с привязкой к видимым деталям. Если файл больше недоступен, честно попроси приложить его снова." },
    },
    kk: {
      more: { label: "Толығырақ", text: "Алдыңғы жауабыңды нақты мәліметтермен кеңірек түсіндір." },
      short: { label: "Қысқаша", text: "Алдыңғы жауапты мағынасын жоғалтпай 3–5 негізгі тармаққа қысқарт." },
      simple: { label: "Оңайлат", text: "Алдыңғы жауапты күрделі терминдерсіз қарапайым тілмен түсіндір." },
      example: { label: "Мысал", text: "Алдыңғы жауапқа қатысты нақты практикалық мысал келтір." },
      steps: { label: "Қадамдар", text: "Алдыңғы жауапты тексеруге болатын қадамдық нұсқаулыққа айналдыр. Интерфейс элементтерінің орнын ойдан шығарма." },
      code: { label: "Кодты тексер", text: "Алдыңғы жауаптағы кодты қате мен қауіпсіздік тұрғысынан тексер, түзетілген нұсқа мен түсіндірме бер." },
      math: { label: "Есепті тексер", text: "Алдыңғы есептеулерді мәндерді қойып, өлшем бірліктерімен қайта тексер." },
      table: { label: "Кесте", text: "Алдыңғы жауапты фактілері мен шектеулерін сақтап, түсінікті кестеге айналдыр." },
      fact: { label: "Деректі тексер", text: "Алдыңғы жауаптағы негізгі деректерді қолжетімді өзекті дереккөздерден тексер, сілтемелер мен расталмаған тұстарын көрсет.", research: true },
      attachment: { label: "Файлды талдау", text: "Алдыңғы сұраудағы тіркемені қайта қарап, көрінетін нақты деректерге сүйеніп толық талда. Файл қолжетімсіз болса, оны қайта тіркеуді сұра." },
    },
    en: {
      more: { label: "More detail", text: "Expand on your previous answer with concrete details." },
      short: { label: "Shorter", text: "Condense your previous answer to 3–5 essential points without losing nuance." },
      simple: { label: "Simplify", text: "Explain your previous answer in plain language with minimal jargon." },
      example: { label: "Example", text: "Give one concrete, practical example of your previous answer." },
      steps: { label: "Steps", text: "Turn your previous answer into verifiable steps. Do not invent UI positions." },
      code: { label: "Review code", text: "Check the code from your previous answer for bugs and security issues. Provide corrected code and explain each change." },
      math: { label: "Check math", text: "Independently verify all calculations in your previous answer, including substituted values and units." },
      table: { label: "As a table", text: "Turn your previous answer into a clear comparison table, preserving facts and caveats." },
      fact: { label: "Verify facts", text: "Check key verifiable claims in your previous answer against available current sources. Cite them and flag what could not be confirmed.", research: true },
      attachment: { label: "Analyze file", text: "Revisit the attachment from the previous request and analyze its observable details. If the file is no longer available, ask for it again instead of inventing its contents." },
    },
  }
  const items = copy[locale]
  const isCode = /(?:```|\b(?:code|coding|python|javascript|typescript)\b|код|програм|функци|бағдарлама)/iu.test(question + "\n" + answer.slice(0, 300))
  const isMath = /(?:[=+×÷∑√]|математ|алгебр|уравнен|расч[её]т|есеп|теңдеу|\b(?:equation|calculate|integral)\b)/iu.test(question)
  const isProcedure = /(?:как|настрой|установ|пошаг|қалай|орнат|баптау|\b(?:how to|steps|setup|install)\b)/iu.test(question)
  const special = context.hasAttachment ? items.attachment : isCode ? items.code : isMath ? items.math : isProcedure ? items.steps : items.table
  // Avoid fact-checking labels for programming or calculations: use their dedicated verification action.
  return [items.more, items.short, items.simple, items.example, special, ...(isCode || isMath || context.hasAttachment ? [] : [items.fact])]
}

