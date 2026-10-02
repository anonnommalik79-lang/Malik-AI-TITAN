/** Build a lightweight click-by-click schematic from the assistant's answer.
 * Never guess coordinates or misrepresent the diagram as a real screenshot.
 * No image generation, network request or backend storage.
 */
export type TapGuideStep = { label: string; instruction: string }
export type TapGuidePlan = { context: string; steps: TapGuideStep[] }
const OPT_OUT = /(?:без\s+(?:фото|картинок|изображений|иллюстраций|схем)|только\s+текст|не\s+(?:показывай|добавляй)\s+(?:фото|картинки|схемы)|text\s+only|no\s+(?:images?|visuals?|diagrams?)|суретсіз)/iu
const HOW_TO = /^(?:(?:как|где|куда|покажи|подскажи|помоги|инструкция|пошагово|настрой|включи|выключи|отключи|how|where|show\s+me|help\s+me|set\s+up|enable|disable|turn\s+on|turn\s+off|қалай|көрсет)(?![\p{L}\p{N}_]))/iu
const CONTEXT = /(?:iphone|айфон|ipad|ios|android|андроид|samsung|windows|виндовс|mac(?:book|os)?\b|telegram|телеграм|whatsapp|ватсап|instagram|инстаграм|tiktok|тикток|youtube|ютуб|github|gitlab|vercel|render\b|supabase|google|gmail|icloud|apple|браузер|browser|настройк|setting|приложени|application|сайт|website|кабинет|панел|меню|экран|кнопк|button|ссылк|опци[яию]|вкладк|раздел|профил|account|регистраци|подключи|создай\s+аккаунт)/iu
const ACTION = /(?:нажм|нажать|кликн|тапн|открой|открыть|перейди|выбер|выбери|включи|отключи|введи|ввести|сохран|прокрут|щ[её]лкн|tap\b|click\b|open\b|select\b|choose\b|press\b|go\s+to|navigate\b|enable\b|disable\b|turn\s+on|turn\s+off|enter\b|save\b|scroll\b|басыңыз|таңдаңыз)/iu
const STEP = /^\s*(?:(\d{1,2})[.)]\s+|(?:шаг|step|қадам)\s+(\d{1,2})[.):]\s+)(.+)$/iu
const LABEL_ACTION = /^(?:(?:нажми(?:те)?|кликни(?:те)?|тапни(?:те)?|выбери(?:те)?|открой(?:те)?|перейди(?:те)?|зайди(?:те)?|включи(?:те)?|отключи(?:те)?|найди(?:те)?|прокрути(?:те)?|введи(?:те)?|сохрани(?:те)?|tap|click|open|select|choose|press|go\s+to|navigate\s+to|enable|disable|enter|save)(?:\s+(?:на|в|во|раздел|пункт|кнопку|вкладку|to|the))?\s+)/iu
function plain(value: string): string {
  return value.replace(/\[([^\]]{1,140})\]\(https?:\/\/[^)\s]+\)/gu, "$1")
    .replace(/(?:\*\*|__|[*_~])/gu, "").replace(/<[^>]+>/gu, "")
    .replace(/\s+/gu, " ").trim().slice(0, 230)
}
function stepLabel(raw: string): string {
  const route = raw.split(/\s*(?:→|➜|⇒)\s*/u).filter(Boolean)
  const part = route.length > 1 ? route[route.length - 1] : raw
  const emphasized = [...part.matchAll(/\*\*([^*]{2,95})\*\*/gu)].map((match) => match[1])
  const quoted = [...part.matchAll(/[«“"]([^»”"]{2,95})[»”"]/gu)].map((match) => match[1])
  let label = emphasized.at(-1) || quoted.at(-1) || part
  label = plain(label).replace(LABEL_ACTION, "").replace(/[.!:,;—–\s]+$/gu, "").trim()
  return (label || plain(part)).slice(0, 90)
}
function numberedSteps(answer: string): TapGuideStep[] {
  const result: TapGuideStep[] = []
  let fenced = false
  let expected: number | null = null
  for (const line of answer.slice(0, 15000).split(/\r?\n/u)) {
    if (/^\s*\x60{3,}/u.test(line)) { fenced = !fenced; continue }
    if (fenced) continue
    const match = STEP.exec(line)
    if (!match) continue
    const number = Number(match[1] || match[2])
    const raw = match[3].trim()
    if (!raw || raw.length > 320) continue
    if (expected !== null && number !== expected) {
      if (result.length >= 2) break
      result.length = 0
      expected = null
    }
    if (expected === null && number !== 1) continue
    result.push({ label: stepLabel(raw), instruction: plain(raw) })
    expected = number + 1
    if (result.length >= 7) break
  }
  return result
}
/** Show a tap diagram only when the question and answer actually describe a UI workflow. */
export function planTapGuide(question: string, answer: string): TapGuidePlan | null {
  const prompt = String(question || "").trim()
  const reply = String(answer || "").trim()
  if (!prompt || !reply || prompt.length > 2500 || OPT_OUT.test(prompt) || !HOW_TO.test(prompt)) return null
  if (!CONTEXT.test(prompt + " " + reply.slice(0, 2400)) || !ACTION.test(reply.slice(0, 4000))) return null
  const steps = numberedSteps(reply)
  if (steps.length < 2 || steps.filter((step) => ACTION.test(step.instruction)).length < 2) return null
  const context = /(?:iphone|айфон|ios|ipad)/iu.test(prompt) ? "iPhone / iOS"
    : /(?:android|андроид|samsung)/iu.test(prompt) ? "Android"
    : /(?:windows|виндовс)/iu.test(prompt) ? "Windows"
    : /(?:macbook|macos|макбук)/iu.test(prompt) ? "Mac"
    : /(?:telegram|телеграм)/iu.test(prompt) ? "Telegram"
    : /(?:whatsapp|ватсап)/iu.test(prompt) ? "WhatsApp"
    : /(?:instagram|инстаграм)/iu.test(prompt) ? "Instagram"
    : /(?:tiktok|тикток)/iu.test(prompt) ? "TikTok"
    : /(?:github)/iu.test(prompt) ? "GitHub"
    : /(?:vercel)/iu.test(prompt) ? "Vercel"
    : /(?:render)/iu.test(prompt) ? "Render"
    : "Интерфейс"
  return { context, steps }
}
