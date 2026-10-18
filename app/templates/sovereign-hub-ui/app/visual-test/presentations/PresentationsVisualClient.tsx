"use client"

import { useEffect, useState } from "react"
import { PresentationStudio } from "@/components/sovereign/presentations/PresentationStudio"
import { SlideFrame } from "@/components/sovereign/presentations/SlideRenderer"
import { DECK_THEMES, THEME_IDS, isThemeId } from "@/lib/presentations/themes"
import type { Deck, Slide, ThemeId } from "@/lib/presentations/types"

/**
 * ?view=studio (default) opens the real studio on a demo deck;
 * ?view=deck shows every slide of the demo deck in one theme;
 * ?view=themes shows four key layouts in every theme.
 * &theme=<id> picks the theme. Pictures are the local showcase photos.
 */

const PHOTO = {
  strategy: "/presentations/showcase/strategy.webp",
  product: "/presentations/showcase/product.webp",
  horizons: "/presentations/showcase/horizons.webp",
}

const SLIDES: Slide[] = [
  { id: "v-title", layout: "title", kicker: "Питч-дек 2026", title: "Кофейня у метро, которая окупается за 14 месяцев", subtitle: "Быстрый утренний кофе для 40 000 пассажиров станции «Абая» каждый день", imageUrl: PHOTO.strategy, imageCredit: "Фото: Start Bootstrap, MIT" },
  { id: "v-features", layout: "features", title: "Три причины, по которым к нам вернутся", intro: "Скорость, вкус и привычка — то, что решает утром.", items: [
    { icon: "zap", title: "90 секунд", body: "От заказа до стакана в руке — без очереди в час пик." },
    { icon: "coffee", title: "Свой обжарщик", body: "Зерно из Алматы, свежая обжарка каждую неделю." },
    { icon: "smile", title: "Подписка", body: "Каждый десятый кофе бесплатно в приложении." },
  ] },
  { id: "v-bullets", layout: "bullets", title: "Пассажирам не хватает быстрого кофе", points: [
    { title: "Очереди по 12 минут", body: "Ближайшие кофейни за пределами станции перегружены с 7:30 до 9:00." },
    { title: "Нет навынос у турникетов", body: "Пассажиры теряют время на выход и возвращение." },
    { title: "Цена выше 1 500 ₸", body: "Сетевые кофейни дороже, чем готовы платить студенты." },
    { title: "Нет предзаказа", body: "Ни одна точка рядом не принимает заказы заранее." },
  ] },
  { id: "v-stat", layout: "stat", title: "Цифры, на которых строится модель", stats: [
    { value: "40 000", label: "пассажиров станции в будний день" },
    { value: "3,2%", label: "конверсия в покупку, оценка" },
    { value: "14 мес", label: "срок окупаемости по плану" },
  ], context: "Пассажиропоток — данные метрополитена; конверсия — допущение, требует проверки." },
  { id: "v-image", layout: "image-text", title: "Стойка у выхода, а не кафе на втором этаже", body: "Шесть квадратных метров у турникетов: кофемашина, витрина с выпечкой и экран предзаказа.", points: ["Аренда в 3 раза дешевле зала", "Два бариста в утреннюю смену"], imageSide: "right", imageUrl: PHOTO.product },
  { id: "v-process", layout: "process", title: "Как заказ проходит за полторы минуты", steps: [
    { title: "Заказ в приложении", body: "Пассажир выбирает напиток ещё в вагоне." },
    { title: "Сигнал бариста", body: "Заказ встаёт в очередь по времени прибытия." },
    { title: "Готово к выходу", body: "Стакан ждёт на полке с именем." },
    { title: "Оплата в один тап", body: "Kaspi или карта, без кассы." },
  ] },
  { id: "v-timeline", layout: "timeline", title: "План запуска на первый год", steps: [
    { label: "Январь", title: "Договор аренды", body: "Подписываем площадь у южного выхода." },
    { label: "Март", title: "Открытие", body: "Мягкий запуск и подписка для первых 500." },
    { label: "Июнь", title: "Вторая точка", body: "Станция «Байконур» при выходе на план." },
    { label: "Декабрь", title: "Окупаемость", body: "Возврат вложений первой точки." },
  ] },
  { id: "v-comparison", layout: "comparison", title: "Чем мы отличаемся от сетевых кофеен", columns: ["Сетевая кофейня", "Наша стойка"], rows: [
    { label: "Время заказа", values: ["6–12 минут", "90 секунд"] },
    { label: "Средний чек", values: ["1 800 ₸", "1 100 ₸"] },
    { label: "Предзаказ", values: ["Нет", "Да, в приложении"] },
    { label: "Место", values: ["Вне станции", "У турникетов"] },
  ], verdict: "Мы выигрываем там, где решают минуты." },
  { id: "v-chart", layout: "chart", title: "Выручка растёт вместе с подпиской", unit: "млн ₸ в месяц, план", data: [
    { label: "Март", value: 2.1 }, { label: "Апрель", value: 3.4 }, { label: "Май", value: 4.2 }, { label: "Июнь", value: 5.0 }, { label: "Июль", value: 5.8 },
  ], takeaway: "Подписчики дают 60% выручки к лету." },
  { id: "v-cards", layout: "cards", title: "Что нужно от инвестора", cards: [
    { title: "18 млн ₸", body: "Оборудование, ремонт стойки и запас на три месяца." },
    { title: "Связи с арендой", body: "Помощь в переговорах о второй станции." },
    { title: "Маркетинг", body: "Запуск подписки для первых пассажиров." },
  ] },
  { id: "v-gallery", layout: "gallery", title: "Как это выглядит", items: [
    { caption: "Утренний поток у выхода", image: { url: PHOTO.strategy } },
    { caption: "Стойка и витрина", image: { url: PHOTO.product } },
    // A real Wikimedia Commons photo: exercises the cross-origin path of the export.
    { caption: "Эспрессо, ради которого приходят", image: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/A_small_cup_of_coffee.JPG/1280px-A_small_cup_of_coffee.JPG", credit: "Julius Schorzman, CC BY-SA 2.0" } },
  ] },
  { id: "v-hero", layout: "hero", kicker: "Наше видение", title: "Кофе по пути — на каждой станции города", subtitle: "Десять точек к 2028 году, одна подписка на все.", imageUrl: PHOTO.horizons },
  { id: "v-two", layout: "two-column", title: "Риски, которые мы уже закрыли", left: { heading: "Риск", points: ["Аренда поднимется", "Поток упадёт летом", "Конкурент откроется рядом"] }, right: { heading: "Ответ", points: ["Договор на 3 года с фиксацией", "Холодные напитки и айс-меню", "Подписка удерживает постоянных"] } },
  { id: "v-quote", layout: "quote", quote: "Если кофе ждёт меня у выхода, я больше не опаздываю на работу.", author: "Айгерим", role: "пассажир, участница теста прототипа" },
  { id: "v-section", layout: "section", number: "02", title: "Финансовая модель", subtitle: "Откуда берутся 14 месяцев окупаемости" },
  { id: "v-closing", layout: "closing", title: "Откроем первую стойку весной", subtitle: "Ищем 18 млн ₸ и партнёра с опытом в ритейле.", contact: "hello@metro.coffee" },
]

function demoDeck(theme: ThemeId): Deck {
  const now = Date.now()
  return { id: "d-visual-demo", title: "Кофейня у метро", theme, language: "ru", slides: SLIDES, prompt: "Питч-дек кофейни у метро в Алматы", createdAt: now, updatedAt: now }
}

export default function PresentationsVisualClient() {
  const [params, setParams] = useState<{ view: string; theme: ThemeId; cols: number } | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const theme = query.get("theme")
    const view = query.get("view") || "studio"
    const chosen = isThemeId(theme) ? theme : "aurora"
    if (view === "studio") window.sessionStorage.setItem("malik.presentation.handoff", JSON.stringify({ deck: demoDeck(chosen) }))
    setParams({ view, theme: chosen, cols: Math.min(6, Math.max(1, Number(query.get("cols")) || 4)) })
  }, [])

  if (!params) return null

  if (params.view === "studio") {
    return (
      <main style={{ minHeight: "100dvh", background: "#000", color: "#fff" }}>
        <PresentationStudio username="visual-test" />
      </main>
    )
  }

  const grid = { display: "grid", gap: 14, padding: 14, background: "#2a2a2a", minHeight: "100dvh" } as const
  const label = { color: "#fff", font: "600 13px/1.3 Inter, Arial, sans-serif", margin: "6px 2px 0" } as const

  if (params.view === "deck") {
    return (
      <main style={{ ...grid, gridTemplateColumns: `repeat(${params.cols}, minmax(0, 1fr))` }}>
        {SLIDES.map((slide, index) => (
          <div key={slide.id}>
            <SlideFrame slide={slide} theme={params.theme} index={index} total={SLIDES.length} />
            <p style={label}>{index + 1}. {slide.layout} · {DECK_THEMES[params.theme].name}</p>
          </div>
        ))}
      </main>
    )
  }

  const picks = ["v-title", "v-features", "v-bullets", "v-stat"].map((id) => SLIDES.findIndex((slide) => slide.id === id))
  return (
    <main style={{ ...grid, gridTemplateColumns: `repeat(${params.cols}, minmax(0, 1fr))` }}>
      {THEME_IDS.flatMap((theme) => picks.map((index) => (
        <div key={`${theme}-${index}`}>
          <SlideFrame slide={SLIDES[index]} theme={theme} index={index} total={SLIDES.length} />
          <p style={label}>{DECK_THEMES[theme].name} · {SLIDES[index].layout}</p>
        </div>
      )))}
    </main>
  )
}
