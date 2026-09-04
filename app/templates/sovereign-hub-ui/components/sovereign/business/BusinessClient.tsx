"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Globe2,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react"

type Lang = "ru" | "kk" | "en"
type AiMessage = { role: "user" | "assistant"; text: string }

const copy = {
  ru: {
    navProduct: "Продукт",
    navDemo: "AI-демо",
    navPrice: "Тарифы",
    navApply: "Заявка",
    dashboard: "Панель лидов",
    eyebrow: "Malik AI Business System",
    titleA: "Сайт, который не просто выглядит дорого.",
    titleB: "Он продаёт вместе с AI и ботом.",
    subtitle:
      "Мы собираем под ключ: премиальный сайт + AI-консультант 24/7 + Telegram/WhatsApp-бот + сбор и квалификация заявок.",
    mainCta: "Получить бесплатный AI-аудит",
    secondCta: "Посмотреть демо",
    metric1: "1 система",
    metric1Text: "сайт + AI + бот",
    metric2: "24/7",
    metric2Text: "ответ клиентам",
    metric3: "3 языка",
    metric3Text: "KZ / RU / EN",
    sectionProduct: "Не набор услуг. Одна машина продаж.",
    sectionProductSub:
      "Клиент приходит из рекламы, поиска или соцсетей. Система объясняет, квалифицирует, собирает контакт и передаёт готовый лид.",
    aiTitle: "Проверь AI-консультанта",
    aiSub: "Выбери нишу и задай вопрос как обычный клиент.",
    ask: "Например: сколько стоит и как записаться?",
    send: "Отправить",
    botTitle: "Бот продолжает разговор там, где удобно клиенту",
    priceTitle: "Три пакета. Один главный результат — заявки.",
    formTitle: "Получить бесплатный персональный прототип",
    formSub: "Мы покажем, как сайт + AI + бот могут выглядеть именно для вашего бизнеса.",
    name: "Имя",
    company: "Компания",
    contact: "Телефон / Telegram / email",
    niche: "Ниша",
    website: "Текущий сайт (если есть)",
    message: "Что хотите улучшить?",
    submit: "Отправить заявку",
    submitting: "Отправляем...",
    success: "Заявка принята. Мы подготовим следующий шаг.",
    error: "Не удалось сохранить заявку. Попробуйте ещё раз или напишите на amangeldymalik38@gmail.com.",
  },
  kk: {
    navProduct: "Өнім",
    navDemo: "AI демо",
    navPrice: "Тарифтер",
    navApply: "Өтінім",
    dashboard: "Лидтер панелі",
    eyebrow: "Malik AI Business System",
    titleA: "Тек әдемі емес сайт.",
    titleB: "AI және ботпен бірге сататын жүйе.",
    subtitle:
      "Біз толық жүйе құрамыз: премиум сайт + 24/7 AI-кеңесші + Telegram/WhatsApp бот + өтінімдерді жинау және іріктеу.",
    mainCta: "Тегін AI-аудит алу",
    secondCta: "Демоны көру",
    metric1: "1 жүйе",
    metric1Text: "сайт + AI + бот",
    metric2: "24/7",
    metric2Text: "клиенттерге жауап",
    metric3: "3 тіл",
    metric3Text: "KZ / RU / EN",
    sectionProduct: "Қызметтер жиыны емес. Бір сату машинасы.",
    sectionProductSub:
      "Клиент жарнамадан, іздеуден немесе әлеуметтік желіден келеді. Жүйе түсіндіреді, іріктейді, контакт алады және дайын лидті береді.",
    aiTitle: "AI-кеңесшіні тексеріңіз",
    aiSub: "Саланы таңдап, кәдімгі клиент сияқты сұрақ қойыңыз.",
    ask: "Мысалы: бағасы қанша және қалай жазыламын?",
    send: "Жіберу",
    botTitle: "Бот әңгімені клиентке ыңғайлы жерде жалғастырады",
    priceTitle: "Үш пакет. Бір негізгі нәтиже — өтінімдер.",
    formTitle: "Тегін жеке прототип алу",
    formSub: "Сайт + AI + бот дәл сіздің бизнесіңіз үшін қалай көрінетінін көрсетеміз.",
    name: "Аты",
    company: "Компания",
    contact: "Телефон / Telegram / email",
    niche: "Сала",
    website: "Қазіргі сайт (бар болса)",
    message: "Нені жақсартқыңыз келеді?",
    submit: "Өтінім жіберу",
    submitting: "Жіберілуде...",
    success: "Өтінім қабылданды. Келесі қадамды дайындаймыз.",
    error: "Өтінімді сақтау мүмкін болмады. Қайта көріңіз немесе amangeldymalik38@gmail.com поштасына жазыңыз.",
  },
  en: {
    navProduct: "Product",
    navDemo: "AI demo",
    navPrice: "Pricing",
    navApply: "Apply",
    dashboard: "Lead dashboard",
    eyebrow: "Malik AI Business System",
    titleA: "A website that does more than look premium.",
    titleB: "It sells with AI and bots.",
    subtitle:
      "We build the complete system: premium website + 24/7 AI consultant + Telegram/WhatsApp bot + lead capture and qualification.",
    mainCta: "Get a free AI audit",
    secondCta: "See the demo",
    metric1: "1 system",
    metric1Text: "site + AI + bot",
    metric2: "24/7",
    metric2Text: "customer replies",
    metric3: "3 languages",
    metric3Text: "KZ / RU / EN",
    sectionProduct: "Not a bundle of services. One sales machine.",
    sectionProductSub:
      "A customer arrives from ads, search or social. The system explains, qualifies, captures contact details and hands over a ready lead.",
    aiTitle: "Test the AI consultant",
    aiSub: "Choose an industry and ask a question like a real customer.",
    ask: "For example: how much does it cost and how do I book?",
    send: "Send",
    botTitle: "The bot continues where the customer is comfortable",
    priceTitle: "Three packages. One main outcome — qualified leads.",
    formTitle: "Get a free personalized prototype",
    formSub: "We will show how site + AI + bot can work for your exact business.",
    name: "Name",
    company: "Company",
    contact: "Phone / Telegram / email",
    niche: "Industry",
    website: "Current website (optional)",
    message: "What do you want to improve?",
    submit: "Send request",
    submitting: "Sending...",
    success: "Request received. We will prepare the next step.",
    error: "Could not save the request. Try again or email amangeldymalik38@gmail.com.",
  },
} as const

const products = [
  { icon: Globe2, title: "Premium Website", text: "Конверсионная структура, мобильный UX, услуги, кейсы, SEO-ready и быстрые CTA." },
  { icon: Sparkles, title: "AI Consultant", text: "Отвечает 24/7, знает услуги, объясняет, квалифицирует и аккуратно переводит к заявке." },
  { icon: Bot, title: "Telegram / WhatsApp Bot", text: "Продолжает диалог, принимает контакты, напоминает и возвращает клиента в воронку." },
  { icon: Workflow, title: "Lead Flow", text: "Все обращения попадают в единую CRM-логику со статусом, источником и следующим действием." },
]

const prices = [
  {
    name: "Website",
    price: "от 180 000 ₸",
    description: "Для бизнеса, которому нужен сильный digital-фундамент.",
    items: ["Премиальный сайт", "Мобильная версия", "Формы заявок", "Базовая аналитика"],
  },
  {
    name: "Website + Bot",
    price: "от 390 000 ₸",
    description: "Сайт и автоматический канал обработки клиентов.",
    items: ["Всё из Website", "Telegram-бот", "WhatsApp-ready интеграция", "CRM-поток", "Follow-up сценарии"],
  },
  {
    name: "AI Business System",
    price: "от 690 000 ₸",
    description: "Главный пакет: сайт + AI + бот + автоматизация под ключ.",
    items: ["Всё из Website + Bot", "AI-консультант 24/7", "База знаний бизнеса", "Квалификация лидов", "Dashboard", "Оптимизация воронки"],
    featured: true,
  },
]

const industries = ["Стоматология", "Салон красоты", "Учебный центр", "Автосервис", "Недвижимость", "Другое"]

export function BusinessClient() {
  const [lang, setLang] = useState<Lang>("ru")
  const t = copy[lang]
  const [industry, setIndustry] = useState(industries[0])
  const [aiInput, setAiInput] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      role: "assistant",
      text: "Здравствуйте! Я AI-консультант. Расскажите, что вас интересует — услуга, стоимость или запись?",
    },
  ])
  const [botChannel, setBotChannel] = useState<"Telegram" | "WhatsApp">("Telegram")
  const [formState, setFormState] = useState<"idle" | "loading" | "success" | "error">("idle")

  const metricCards = useMemo(
    () => [
      [t.metric1, t.metric1Text],
      [t.metric2, t.metric2Text],
      [t.metric3, t.metric3Text],
    ],
    [t],
  )

  async function sendAiMessage() {
    const text = aiInput.trim()
    if (!text || aiLoading) return
    setMessages((prev) => [...prev, { role: "user", text }])
    setAiInput("")
    setAiLoading(true)
    try {
      const response = await fetch("/api/business/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, industry, lang }),
      })
      const payload = await response.json().catch(() => ({}))
      const answer = String(payload?.answer || payload?.output || "")
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: answer || "Могу уточнить услугу, бюджет и удобный способ связи, чтобы подготовить следующий шаг.",
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Сейчас AI-канал временно недоступен, но заявка и бот продолжают работать. Оставьте контакт — мы покажем персональный сценарий.",
        },
      ])
    } finally {
      setAiLoading(false)
    }
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (formState === "loading") return
    setFormState("loading")
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries())
    try {
      const response = await fetch("/api/business/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, lang, source: "business-page" }),
      })
      if (!response.ok) throw new Error("lead_failed")
      setFormState("success")
      event.currentTarget.reset()
    } catch {
      setFormState("error")
    }
  }

  return (
    <main className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/business" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-xl border border-white/15 bg-white text-black">M</span>
            <span>Malik AI Business</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
            <a href="#product" className="transition hover:text-white">{t.navProduct}</a>
            <a href="#demo" className="transition hover:text-white">{t.navDemo}</a>
            <a href="#pricing" className="transition hover:text-white">{t.navPrice}</a>
            <a href="#apply" className="transition hover:text-white">{t.navApply}</a>
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-full border border-white/10 bg-white/5 p-1 sm:flex">
              {(["ru", "kk", "en"] as Lang[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setLang(item)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase transition ${lang === item ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <Link href="/business/dashboard" className="hidden rounded-full border border-white/15 px-4 py-2 text-xs font-medium sm:inline-flex">
              {t.dashboard}
            </Link>
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden px-4 pb-24 pt-32 sm:px-6 lg:px-8 lg:pb-32 lg:pt-44">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(59,130,246,0.2),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(168,85,247,0.16),transparent_24%)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="max-w-5xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-medium text-zinc-300">
              <Sparkles className="size-4" /> {t.eyebrow}
            </div>
            <h1 className="text-balance text-5xl font-semibold tracking-[-0.055em] sm:text-6xl lg:text-8xl">
              {t.titleA}
              <span className="mt-2 block bg-gradient-to-r from-white via-blue-200 to-violet-300 bg-clip-text text-transparent">{t.titleB}</span>
            </h1>
            <p className="mt-8 max-w-3xl text-lg leading-8 text-zinc-400 sm:text-xl">{t.subtitle}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#apply" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:scale-[1.02]">
                {t.mainCta} <ArrowRight className="size-4" />
              </a>
              <a href="#demo" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                {t.secondCta} <ChevronRight className="size-4" />
              </a>
            </div>
          </div>

          <div className="mt-16 grid gap-3 sm:grid-cols-3">
            {metricCards.map(([value, label]) => (
              <div key={value} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl">
                <div className="text-3xl font-semibold tracking-tight">{value}</div>
                <div className="mt-2 text-sm text-zinc-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="border-y border-white/10 bg-zinc-950/70 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">System</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">{t.sectionProduct}</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-400">{t.sectionProductSub}</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {products.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-3xl border border-white/10 bg-black p-6">
                <div className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-500">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950">
            <div className="border-b border-white/10 p-6 sm:p-8">
              <p className="text-sm font-semibold text-blue-300">LIVE AI</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{t.aiTitle}</h2>
              <p className="mt-2 text-sm text-zinc-500">{t.aiSub}</p>
            </div>
            <div className="h-[360px] space-y-4 overflow-y-auto p-6 sm:p-8">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[84%] rounded-3xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-white text-black" : "border border-white/10 bg-white/[0.045] text-zinc-200"}`}>
                    {message.text}
                  </div>
                </div>
              ))}
              {aiLoading && <div className="w-fit rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-500">Malik AI думает…</div>}
            </div>
            <div className="border-t border-white/10 p-4 sm:p-6">
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="mb-3 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-zinc-300 outline-none">
                {industries.map((item) => <option key={item}>{item}</option>)}
              </select>
              <div className="flex gap-2">
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendAiMessage()}
                  placeholder={t.ask}
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-white/25"
                />
                <button onClick={sendAiMessage} disabled={aiLoading} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-black disabled:opacity-50" aria-label={t.send}>
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-zinc-950 to-black p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-violet-300">BOT FLOW</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{t.botTitle}</h2>
              </div>
              <MessageCircle className="size-6 text-zinc-500" />
            </div>
            <div className="mt-7 flex rounded-full border border-white/10 bg-black p-1">
              {(["Telegram", "WhatsApp"] as const).map((channel) => (
                <button key={channel} onClick={() => setBotChannel(channel)} className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${botChannel === channel ? "bg-white text-black" : "text-zinc-500"}`}>
                  {channel}
                </button>
              ))}
            </div>
            <div className="mt-6 rounded-3xl border border-white/10 bg-black p-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <div className="grid size-9 place-items-center rounded-full bg-white text-black"><Bot className="size-4" /></div>
                <div><div className="text-sm font-semibold">Malik Business Bot</div><div className="text-xs text-zinc-600">{botChannel} · online</div></div>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <div className="max-w-[90%] rounded-2xl bg-zinc-900 px-4 py-3 text-zinc-300">Здравствуйте! Что вас интересует?</div>
                <div className="ml-auto max-w-[85%] rounded-2xl bg-white px-4 py-3 text-black">Хочу узнать стоимость и записаться.</div>
                <div className="max-w-[90%] rounded-2xl bg-zinc-900 px-4 py-3 text-zinc-300">Отлично. Подберу нужную услугу и передам заявку администратору. Как к вам обращаться?</div>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {["Контакт получен", "Источник определён", "Заявка квалифицирована", "Следующее действие назначено"].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-zinc-400"><span className="grid size-6 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="size-3.5" /></span>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-zinc-950/70 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Lead OS</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">Каждая заявка превращается в следующий шаг.</h2>
              <p className="mt-5 leading-7 text-zinc-500">Система хранит источник, контакт, нишу, статус и контекст. Владелец видит не хаос сообщений, а понятную очередь продаж.</p>
              <Link href="/business/dashboard" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white">Открыть owner dashboard <ArrowRight className="size-4" /></Link>
            </div>
            <div className="rounded-[32px] border border-white/10 bg-black p-5 sm:p-7">
              <div className="grid gap-3 sm:grid-cols-3">
                {[["12", "Новых лидов"], ["5", "Квалифицировано"], ["2", "Готовы к звонку"]].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className="text-3xl font-semibold">{value}</div><div className="mt-2 text-xs text-zinc-600">{label}</div></div>
                ))}
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                {["Alma Dental · Website + AI", "Study Pro · Bot + CRM", "AutoLab · Full System"].map((lead, i) => (
                  <div key={lead} className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4 last:border-b-0">
                    <div><div className="text-sm font-medium">{lead}</div><div className="mt-1 text-xs text-zinc-600">Сегодня · source: outbound</div></div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] ${i === 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-blue-400/10 text-blue-300"}`}>{i === 0 ? "hot" : "new"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Pricing</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">{t.priceTitle}</h2></div>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {prices.map((plan) => (
              <article key={plan.name} className={`relative rounded-[32px] border p-7 ${plan.featured ? "border-white bg-white text-black" : "border-white/10 bg-zinc-950"}`}>
                {plan.featured && <div className="absolute right-5 top-5 rounded-full bg-black px-3 py-1 text-[11px] font-semibold text-white">BEST</div>}
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <div className="mt-5 text-3xl font-semibold tracking-tight">{plan.price}</div>
                <p className={`mt-3 text-sm leading-6 ${plan.featured ? "text-zinc-600" : "text-zinc-500"}`}>{plan.description}</p>
                <div className="mt-7 space-y-3">
                  {plan.items.map((item) => <div key={item} className="flex items-start gap-3 text-sm"><Check className="mt-0.5 size-4 shrink-0" />{item}</div>)}
                </div>
                <a href="#apply" className={`mt-8 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold ${plan.featured ? "bg-black text-white" : "bg-white text-black"}`}>Выбрать пакет</a>
              </article>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-600">Финальная стоимость зависит от объёма интеграций и контента. Цены не являются публичной офертой.</p>
        </div>
      </section>

      <section id="apply" className="px-4 pb-28 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl overflow-hidden rounded-[36px] border border-white/10 bg-zinc-950 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="border-b border-white/10 p-7 sm:p-10 lg:border-b-0 lg:border-r">
            <div className="grid size-12 place-items-center rounded-2xl bg-white text-black"><Zap className="size-5" /></div>
            <h2 className="mt-7 text-4xl font-semibold tracking-[-0.045em]">{t.formTitle}</h2>
            <p className="mt-4 leading-7 text-zinc-500">{t.formSub}</p>
            <div className="mt-8 space-y-4 text-sm text-zinc-400">
              <div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-emerald-300" /> Без обязательств</div>
              <div className="flex gap-3"><Sparkles className="size-5 shrink-0 text-blue-300" /> Персонально под ваш бренд</div>
              <div className="flex gap-3"><Workflow className="size-5 shrink-0 text-violet-300" /> Сценарий сайта + AI + бота</div>
            </div>
          </div>
          <form onSubmit={submitLead} className="grid gap-4 p-7 sm:p-10 sm:grid-cols-2">
            <label className="grid gap-2 text-sm"><span className="text-zinc-400">{t.name}</span><input name="name" required maxLength={80} className="rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-white/25" /></label>
            <label className="grid gap-2 text-sm"><span className="text-zinc-400">{t.company}</span><input name="company" required maxLength={120} className="rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-white/25" /></label>
            <label className="grid gap-2 text-sm"><span className="text-zinc-400">{t.contact}</span><input name="contact" required maxLength={160} className="rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-white/25" /></label>
            <label className="grid gap-2 text-sm"><span className="text-zinc-400">{t.niche}</span><select name="niche" className="rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none">{industries.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="grid gap-2 text-sm sm:col-span-2"><span className="text-zinc-400">{t.website}</span><input name="website" maxLength={200} placeholder="https://" className="rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-white/25" /></label>
            <label className="grid gap-2 text-sm sm:col-span-2"><span className="text-zinc-400">{t.message}</span><textarea name="message" maxLength={1200} rows={4} className="resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-white/25" /></label>
            <input name="company_site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <div className="sm:col-span-2">
              <button disabled={formState === "loading"} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black disabled:opacity-60">{formState === "loading" ? t.submitting : t.submit}<ArrowRight className="size-4" /></button>
              {formState === "success" && <p className="mt-3 text-center text-sm text-emerald-300">{t.success}</p>}
              {formState === "error" && <p className="mt-3 text-center text-sm text-red-300">{t.error}</p>}
            </div>
          </form>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-8 text-sm text-zinc-600 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 sm:flex-row"><span>© 2026 Malik AI Business</span><span>amangeldymalik38@gmail.com</span></div>
      </footer>
    </main>
  )
}
