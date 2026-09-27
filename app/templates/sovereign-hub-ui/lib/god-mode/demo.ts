import "server-only"

export const GOD_DEMO_SCENARIOS = [
  {
    id: "startup-builder",
    title: "Startup Builder",
    language: "ru",
    prompt: "Создай казахстанский технологический бренд для электрического транспорта и подготовь всё для разговора с инвестором.",
    capabilities: ["research", "business", "image", "website", "video", "presentation"],
    successCriteria: [
      "Все факты исследования имеют источники или помечены как предположения.",
      "Сайт является рабочим кодом, а не картинкой.",
      "Медиа-байты не проксируются через Render.",
      "Investor deck не выдумывает traction, выручку или клиентов.",
    ],
  },
  {
    id: "creative-studio",
    title: "Creative Studio",
    language: "ru",
    prompt: "Создай рекламную кампанию для премиального казахстанского электромобиля: ключевой визуал, короткое видео и оригинальный саундтрек.",
    capabilities: ["image", "video", "music", "project"],
    successCriteria: [
      "Изображение используется как референс видео без ручной повторной загрузки, если провайдер поддерживает ссылку.",
      "Видео и аудио воспроизводятся внутри Malik AI, но грузятся напрямую от provider/CDN.",
      "Все результаты связаны с одним Project.",
    ],
  },
  {
    id: "developer-agent",
    title: "Developer Agent",
    language: "ru",
    prompt: "Создай рабочий responsive SaaS dashboard, проверь preview, исправь найденные runtime-ошибки и подготовь проект к экспорту.",
    capabilities: ["code", "website", "preview", "repair", "project"],
    successCriteria: [
      "Создаётся реальный multi-file код.",
      "Ошибки preview поступают обратно в repair loop.",
      "Изменения имеют diff/rollback path.",
      "Mobile layout проверяется отдельно от desktop.",
    ],
  },
] as const

export function godDemoScenario(id: string) {
  return GOD_DEMO_SCENARIOS.find((item) => item.id === id) || null
}
