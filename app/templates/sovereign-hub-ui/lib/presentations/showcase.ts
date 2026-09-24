import type { Slide, ThemeId } from "@/lib/presentations/types"

/**
 * The sample slides on the studio's start screen (desktop): four slides from
 * four kinds of professional decks, each in its own theme, drawn by the real
 * slide renderer — so the preview is exactly what the studio makes.
 *
 * The photographs are free stock photos from Start Bootstrap's MIT-licensed
 * templates, stored in public/presentations/showcase (see CREDITS.md there);
 * nothing is fetched from elsewhere. The decks are fictional examples.
 */

export type ShowcaseItem = { slide: Slide; theme: ThemeId; label: string }

export const SHOWCASE: ShowcaseItem[] = [
  {
    label: "Стратегия",
    theme: "obsidian",
    slide: {
      id: "showcase-1",
      layout: "title",
      kicker: "Инвестиционная презентация",
      title: "Стратегия роста 2026",
      subtitle: "Как компания выходит на новые рынки",
      imageUrl: "/presentations/showcase/strategy.webp",
    } as Slide,
  },
  {
    label: "Продукт",
    theme: "paper",
    slide: {
      id: "showcase-2",
      layout: "image-text",
      title: "Продукт, которым пользуются каждый день",
      body: "Одна панель для продаж, маркетинга и финансов — решения за минуты, а не за недели.",
      points: ["Данные в реальном времени", "Прогноз на квартал вперёд"],
      imageSide: "left",
      imageUrl: "/presentations/showcase/product.webp",
    } as Slide,
  },
  {
    label: "Итоги года",
    theme: "royal",
    slide: {
      id: "showcase-3",
      layout: "stat",
      title: "Итоги года",
      stats: [
        { value: "+248%", label: "рост выручки" },
        { value: "18", label: "новых рынков" },
        { value: "4,9", label: "оценка клиентов" },
      ],
      context: "Пример презентации: цифры условные.",
    } as Slide,
  },
  {
    label: "Экспансия",
    theme: "sand",
    slide: {
      id: "showcase-4",
      layout: "title",
      kicker: "Экспансия",
      title: "Новые горизонты",
      subtitle: "Пять стран за два года — план выхода",
      imageUrl: "/presentations/showcase/horizons.webp",
    } as Slide,
  },
]
