/*
 * Instant replies exist only for turns that are exactly a greeting, «кто ты»
 * or «что умеешь». They used to fire on any message shorter than eight
 * characters and on any sentence containing «что ты», so «кто он?»,
 * «почему?» and «2+2?» got «Привет… Чем помогаю?» and «что ты думаешь о
 * Tesla?» got the product description - answers to a question nobody asked.
 */
const GREETING = /^(?:привет(?:ик)?|салам|сәлем|здравствуй(?:те)?|добрый\s+(?:день|вечер)|доброе\s+утро|hi|hello|hey|йо|ку|здарова|ассалаумағалейкум|ассалам(?:у\s+алейкум)?|assalamu(?:\s+alaikum)?|ты\s+тут|алло)(?:\s*,?\s*(?:бро|брат|малик|malik))?[\s.!?)]*$/iu
const HOW_ARE_YOU = /^(?:(?:привет|салам|сәлем|hi|hello|hey)[\s,!.]*)?(?:как\s+(?:дела|ты|сам|поживаешь|жизнь)|қалайсың|қалың\s+қалай|how\s+are\s+you|how's\s+it\s+going)[\s.!?)]*$/iu

export function isTinyCasual(prompt: string) {
  const p = prompt.trim()
  return !p || GREETING.test(p) || HOW_ARE_YOU.test(p)
}

function isIdentity(prompt: string) {
  return /^(?:а\s+)?(?:кто|что)\s+ты(?:\s+(?:такой|такое))?[\s.!?]*$|^(?:who|what)\s+are\s+you[\s.!?]*$|^сен\s+кім(?:сің)?[\s.!?]*$/iu.test(prompt.trim())
}

function isCapabilities(prompt: string) {
  return /^(?:а\s+)?(?:что\s+(?:ты\s+)?умеешь(?:\s+делать)?|на\s+что\s+(?:ты\s+)?способен|what\s+can\s+you\s+do)[\s.!?]*$/iu.test(prompt.trim())
}

/** The instant reply for this turn, or "" when the model should answer. */
export function instantReply(prompt: string) {
  const kazakh = /[әіңғүұқөһ]/iu.test(prompt)
  const english = !/[а-яё]/iu.test(prompt) && /[a-z]/iu.test(prompt)
  if (HOW_ARE_YOU.test(prompt.trim())) {
    return kazakh ? "Жақсы, рахмет! Өзіңіз қалайсыз? Немен көмектесейін?"
      : english ? "I'm doing great, thanks! How about you? What can I help with?"
        : "Всё отлично, спасибо! А у Вас как? Чем могу помочь?"
  }
  if (isTinyCasual(prompt)) {
    return kazakh ? "Сәлем! Мен осындамын. Немен көмектесейін?"
      : english ? "Hi! I'm here. What can I help with?"
        : "Привет! Я здесь. Чем могу помочь?"
  }
  if (isIdentity(prompt)) return "Я MALIK AI V6.5 TITAN — твой AI-командный центр для ответов, кода, идей, дизайна, анализа, поиска свежей информации и запуска проектов."
  if (isCapabilities(prompt)) return "Я работаю через Malik Superpower OS: глубокое мышление и research, Web Scout, Vision, изображения и редактирование, файлы и Data Lab, голос, память, проекты и библиотеку, Study, Work/Agent, документы, таблицы, презентации, сайты, browser actions, подключённые приложения, автоматизации и длинные workflow. Кодекс остаётся отдельным режимом и в Superpower OS не смешивается."
  return ""
}
