export type MalikTemplateMode = "chat" | "website" | "app" | "business" | "image" | "video" | "code" | "data"

export type MalikTemplateCategory =
  | "AI"
  | "Исследования"
  | "Сайты"
  | "Приложения"
  | "Бизнес"
  | "Маркетинг"
  | "Изображения"
  | "Видео"
  | "Код"
  | "Данные"

export type MalikTemplate = {
  id: string
  title: string
  description: string
  category: MalikTemplateCategory
  mode: MalikTemplateMode
  preview: string
  prompt: string
  featured: boolean
}

type TemplateSeed = readonly [id: string, title: string, description: string]

type TemplateGroup = {
  category: MalikTemplateCategory
  mode: MalikTemplateMode
  promptLead: string
  templates: readonly TemplateSeed[]
}

const PHOTO_IDS = [
  "photo-1460925895917-afdab827c52f",
  "photo-1556761175-b413da4baf72",
  "photo-1516321318423-f06f85e504b3",
  "photo-1456513080510-7bf3a84b82f8",
  "photo-1589829545856-d10d557cf95f",
  "pexels:3182773",
  "photo-1542744173-8e7e53415bb0",
  "photo-1522202176988-66273c2fd55f",
  "photo-1517245386807-bb43f82c33c4",
  "photo-1499750310107-5fef28a66643",
  "photo-1523240795612-9a054b0db644",
  "photo-1522071820081-009f0129c71c",
  "photo-1454165804606-c3d57bc86b40",
  "photo-1498050108023-c5249f4df085",
  "photo-1555066931-4365d14bab8c",
  "photo-1515879218367-8466d910aaa4",
  "photo-1504384308090-c894fdcc538d",
  "photo-1518770660439-4636190af475",
  "photo-1558494949-ef010cbdcc31",
  "photo-1563986768609-322da13575f3",
  "pexels:3861969",
  "photo-1497366754035-f200968a6e72",
  "photo-1487058792275-0ad4aaf24ca7",
  "photo-1560518883-ce09059eeffa",
  "photo-1507003211169-0a1dd7228f2d",
  "photo-1503376780353-7e6692767b70",
  "photo-1492144534655-ae79c964c9d7",
  "photo-1504674900247-0877df9cc836",
  "photo-1523275335684-37898b6baf30",
  "photo-1492684223066-81342ee5ff30",
  "photo-1551288049-bebda4e38f71",
  "photo-1556742049-0cfed4f6a45d",
  "photo-1451187580459-43490279c0fa",
  "pexels:3182812",
  "photo-1625246333195-78d9c38ad449",
  "photo-1576091160399-112ba8d25d1d",
  "photo-1540575467063-178a50c2df87",
  "pexels:1181244",
  "photo-1500530855697-b586d89ba3ee",
  "photo-1469854523086-cc02fe5d8800",
  "photo-1534528741775-53994a69daeb",
  "pexels:1181298",
  "photo-1541961017774-22349e4a1262",
  "photo-1485846234645-a62644f84728",
  "pexels:1181354",
  "pexels:3861958",
  "photo-1506905925346-21bda4d32df4",
  "pexels:1181675",
  "photo-1518005020951-eccb494ad742",
  "photo-1472214103451-9374bd1c798e",
  "pexels:3861972",
  "photo-1536440136628-849c177e76a1",
  "pexels:3861964",
  "photo-1614850523459-c2f4c699c52e",
  "pexels:3861976",
  "photo-1446776811953-b23d57bd21aa",
  "photo-1592210454359-9043f067919b",
  "pexels:3182811",
  "pexels:3183150",
  "pexels:3183197",
  "photo-1639762681485-074b7f938ba0",
  "photo-1558618666-fcd25c85cd64",
  "photo-1504639725590-34d0984388bd",
  "pexels:3184418",
  "photo-1512941937669-90a1b58e7e9c",
  "photo-1526374965328-7f61d4dc18c5",
  "photo-1531297484001-80022131f5a1",
  "photo-1496181133206-80ce9b88a853",
  "photo-1531482615713-2afd69097998",
  "photo-1519389950473-47ba0277781c",
  "photo-1551836022-d5d88e9218df",
  "pexels:3184436",
  "pexels:3184454",
  "photo-1565008576549-57569a49371d",
  "pexels:3184465",
  "photo-1461896836934-ffe607ba8211",
  "photo-1574717024653-61fd2cf4d44d",
  "pexels:3184306",
  "photo-1497215728101-856f4ea42174",
  "photo-1516321165247-4aa89a48be28",
  "photo-1552664730-d307ca884978",
  "photo-1521737711867-e3b97375f902",
  "photo-1551434678-e076c223a692",
  "photo-1553877522-43269d4ea984",
  "photo-1497366811353-6870744d04b2",
  "photo-1521791136064-7986c2920216",
  "photo-1560179707-f14e90ef3623",
  "photo-1560250097-0b93528c311a",
  "photo-1573496359142-b8d87734a5a2",
  "photo-1573496799652-408c2ac9fe98",
  "photo-1580489944761-15a19d654956",
  "photo-1524504388940-b1c1722653e1",
  "photo-1544005313-94ddf0286df2",
  "photo-1517841905240-472988babdf9",
  "photo-1503023345310-bd7c1de61c7d",
  "photo-1515886657613-9f3515b0c78f",
  "photo-1490481651871-ab68de25d43d",
  "pexels:3184287",
  "photo-1521295121783-8a321d551ad2",
  "photo-1500534314209-a25ddb2bd429",
] as const

const FEATURED_IDS = new Set([
  "general-ai-assistant",
  "deep-research",
  "ai-startup-landing",
  "saas-dashboard",
  "crm-workspace",
  "investor-pitch",
  "ecommerce-storefront",
  "social-content-studio",
  "product-photography",
  "product-commercial",
  "nextjs-project",
  "analytics-dashboard",
])

const GROUPS: readonly TemplateGroup[] = [
  {
    category: "AI",
    mode: "chat",
    promptLead: "Настрой новый диалог Malik AI как специализированного ассистента",
    templates: [
      ["general-ai-assistant", "Универсальный AI-ассистент", "Задачи, идеи, тексты и ежедневные решения в одном диалоге."],
      ["deep-thinking", "Глубокое мышление", "Разбор сложной проблемы по шагам с проверкой допущений."],
      ["business-advisor", "Бизнес-советник", "Стратегия, бизнес-модель и практичный план действий."],
      ["legal-document-assistant", "Помощник по документам", "Черновики договоров, писем и структурированный разбор условий."],
      ["marketing-assistant", "Маркетинг-ассистент", "Позиционирование, офферы и контент под конкретную аудиторию."],
      ["sales-coach", "Тренер по продажам", "Скрипты, возражения и подготовка к переговорам."],
      ["support-desk", "Служба поддержки", "Быстрые точные ответы и база сценариев для клиентов."],
      ["resume-assistant", "Карьерный помощник", "Резюме, сопроводительное письмо и подготовка к интервью."],
      ["translator-pro", "Переводчик Pro", "Перевод с сохранением тона, терминологии и структуры."],
      ["meeting-copilot", "Помощник для встреч", "Повестка, вопросы, заметки и список следующих действий."],
    ],
  },
  {
    category: "Исследования",
    mode: "chat",
    promptLead: "Открой исследовательский диалог Malik AI и подготовь рабочий процесс",
    templates: [
      ["deep-research", "Глубокое исследование", "План поиска, сравнение источников и итоговый аналитический отчёт."],
      ["study-assistant", "Учебный ассистент", "Понятные объяснения, конспект и персональный план обучения."],
      ["paper-summarizer", "Разбор научной статьи", "Методология, выводы, ограничения и практическая ценность."],
      ["exam-coach", "Подготовка к экзамену", "Диагностика знаний, задания и расписание повторения."],
      ["math-tutor", "Репетитор по математике", "Пошаговые решения с объяснением логики и проверкой ответа."],
      ["language-tutor", "Языковой тренер", "Диалоги, исправление ошибок и расширение словарного запаса."],
      ["lesson-planner", "Конструктор урока", "Цели, структура занятия, упражнения и оценка результата."],
      ["citation-finder", "Поиск источников", "Карта надёжных источников и структура цитирования."],
      ["market-research", "Исследование рынка", "Сегменты, спрос, конкуренты и возможности для продукта."],
      ["competitor-analysis", "Анализ конкурентов", "Сравнение функций, цен, позиционирования и слабых мест."],
    ],
  },
  {
    category: "Сайты",
    mode: "website",
    promptLead: "Открой конструктор сайтов Malik AI и загрузи производственный бриф",
    templates: [
      ["ai-startup-landing", "AI Startup Landing", "Современный запуск AI-продукта с доказательствами и CTA."],
      ["corporate-website", "Корпоративный сайт", "Серьёзная структура компании, услуг, кейсов и контактов."],
      ["founder-portfolio", "Портфолио основателя", "История, проекты, компетенции и удобная связь."],
      ["product-launch", "Запуск продукта", "Hero, преимущества, демонстрация, тарифы и waitlist."],
      ["restaurant-website", "Сайт ресторана", "Меню, атмосфера, бронирование и контакты."],
      ["real-estate-portal", "Портал недвижимости", "Каталог объектов, фильтры, ипотека и заявки."],
      ["travel-experience", "Travel Experience", "Маршруты, впечатления, предложения и бронирование."],
      ["digital-newsroom", "Digital Newsroom", "Редакционная главная, рубрики, материалы и live-лента."],
      ["event-page", "Страница события", "Программа, спикеры, билеты, место и регистрация."],
      ["nonprofit-website", "Сайт фонда", "Миссия, программы, прозрачность и сценарий пожертвования."],
    ],
  },
  {
    category: "Приложения",
    mode: "app",
    promptLead: "Открой продуктовый builder Malik AI и загрузи архитектуру приложения",
    templates: [
      ["saas-dashboard", "SaaS Dashboard", "Метрики продукта, пользователи, биллинг и системные события."],
      ["admin-control", "Admin Control", "Роли, пользователи, модерация и состояние системы."],
      ["crm-workspace", "CRM Workspace", "Воронка, клиенты, задачи, сделки и отчёты."],
      ["booking-platform", "Booking Platform", "Календарь, услуги, слоты и подтверждение записи."],
      ["customer-portal", "Customer Portal", "Профиль, заказы, документы, обращения и уведомления."],
      ["subscription-hub", "Subscription Hub", "Тарифы, usage, счета и управление подпиской."],
      ["project-manager", "Project Manager", "Проекты, доска задач, сроки и командный прогресс."],
      ["hr-dashboard", "HR Dashboard", "Сотрудники, найм, отпуск, цели и аналитика команды."],
      ["inventory-system", "Inventory System", "Остатки, поставщики, движения и предупреждения."],
      ["service-marketplace", "Marketplace", "Каталог исполнителей, заявки, сделки и рейтинги."],
    ],
  },
  {
    category: "Бизнес",
    mode: "business",
    promptLead: "Открой бизнес-штаб Malik AI и подготовь запрос",
    templates: [
      ["sales-dashboard", "Sales Dashboard", "Выручка, воронка, менеджеры и прогноз закрытия сделок."],
      ["finance-planner", "Финансовый план", "Доходы, расходы, cash flow и сценарии роста."],
      ["invoice-system", "Система счетов", "Клиенты, позиции, налоги, статусы и экспорт документов."],
      ["growth-strategy", "Стратегия роста", "Каналы, эксперименты, метрики и план на 90 дней."],
      ["business-plan", "Бизнес-план", "Рынок, продукт, экономика, операции и дорожная карта."],
      ["investor-pitch", "Investor Pitch", "Проблема, решение, traction, рынок, команда и ask."],
      ["operations-center", "Operations Center", "Процессы, SLA, риски и ежедневный контроль операций."],
      ["customer-success", "Customer Success", "Онбординг, здоровье клиентов, удержание и playbook."],
      ["hiring-pipeline", "Hiring Pipeline", "Вакансии, кандидаты, этапы и решения команды."],
      ["risk-audit", "Аудит рисков", "Карта рисков, вероятность, влияние и план снижения."],
    ],
  },
  {
    category: "Маркетинг",
    mode: "website",
    promptLead: "Открой creator workspace Malik AI и загрузи коммерческий шаблон",
    templates: [
      ["ecommerce-storefront", "E-commerce Storefront", "Каталог, карточки товаров, корзина и checkout."],
      ["product-catalog", "Каталог продуктов", "Фильтры, сравнение, подбор и запрос предложения."],
      ["campaign-planner", "Планировщик кампании", "Цели, сегменты, сообщения, каналы и календарь."],
      ["social-content-studio", "Social Content Studio", "Контент-план, форматы, идеи и публикации."],
      ["email-campaign", "Email Campaign", "Серия писем, сегментация, темы и конверсионные CTA."],
      ["brand-strategy", "Brand Strategy", "Позиционирование, ценности, голос и визуальное направление."],
      ["ad-creative-system", "Ad Creative System", "Варианты рекламных концепций и система тестирования."],
      ["seo-content-hub", "SEO Content Hub", "Семантика, кластеризация, статьи и внутренняя перелинковка."],
      ["launch-campaign", "Launch Campaign", "Подготовка, тизеры, запуск и post-launch коммуникация."],
      ["conversion-product-page", "Конверсионная карточка", "Фото, преимущества, варианты, отзывы и покупка."],
    ],
  },
  {
    category: "Изображения",
    mode: "image",
    promptLead: "Открой Malik Vision и установи редактируемый визуальный промпт",
    templates: [
      ["product-photography", "Предметная фотография", "Чистая студийная сцена для продукта и рекламы."],
      ["cinematic-portrait", "Кинематографичный портрет", "Выразительный свет, глубина и premium editorial look."],
      ["fashion-editorial", "Fashion Editorial", "Современная модная съёмка для кампании или журнала."],
      ["architecture-render", "Архитектурный рендер", "Фотореалистичная архитектура, окружение и свет."],
      ["interior-design", "Interior Design", "Продуманный интерьер с материалами и естественным освещением."],
      ["logo-concept", "Logo Concept", "Оригинальное направление логотипа и бренд-символа."],
      ["poster-design", "Poster Design", "Сильная композиция, типографика и визуальная идея."],
      ["social-media-visual", "Social Media Visual", "Готовый визуал для публикации или рекламного поста."],
      ["youtube-thumbnail", "YouTube Thumbnail", "Контрастная обложка с ясным фокусом и эмоцией."],
      ["game-concept-art", "Game Concept Art", "Персонаж, окружение и атмосфера игрового мира."],
    ],
  },
  {
    category: "Видео",
    mode: "video",
    promptLead: "Открой Malik Cinema и загрузи редактируемый сценарий",
    templates: [
      ["product-commercial", "Product Commercial", "Короткий рекламный ролик с продуктом и финальным CTA."],
      ["cinematic-trailer", "Cinematic Trailer", "Драматичный трейлер со сценами, темпом и кульминацией."],
      ["ai-avatar-video", "AI Avatar Video", "Ролик с ведущим, структурой речи и визуальными вставками."],
      ["social-video-ad", "Social Video Ad", "Вертикальная реклама для быстрого захвата внимания."],
      ["music-video", "Music Video", "Визуальная концепция клипа, сцены и ритмичный монтаж."],
      ["product-showcase", "Product Showcase", "Детальная демонстрация продукта и его преимуществ."],
      ["short-film", "Short Film", "Короткая история с героями, конфликтом и финалом."],
      ["logo-animation", "Logo Animation", "Чистое появление бренда с движением и звуковым акцентом."],
      ["youtube-intro", "YouTube Intro", "Короткая фирменная заставка для канала."],
      ["instagram-reel", "Instagram Reel", "Динамичный вертикальный ролик с сильным первым кадром."],
    ],
  },
  {
    category: "Код",
    mode: "code",
    promptLead: "Открой кодовый workspace Malik AI и загрузи техническое задание",
    templates: [
      ["python-application", "Python Application", "Структурированное приложение с конфигурацией и тестами."],
      ["react-application", "React Application", "Компонентное приложение с состоянием и адаптивным UI."],
      ["nextjs-project", "Next.js Project", "Full-stack проект с App Router, API и production build."],
      ["node-api", "Node.js API", "REST API с валидацией, логами и обработкой ошибок."],
      ["fastapi-backend", "FastAPI Backend", "Типизированный Python API с документацией и тестами."],
      ["telegram-bot", "Telegram Bot", "Команды, состояния, обработчики и безопасная конфигурация."],
      ["discord-bot", "Discord Bot", "Команды, роли, события и модерационные сценарии."],
      ["automation-script", "Automation Script", "Надёжная автоматизация повторяющегося рабочего процесса."],
      ["web-scraper", "Web Scraper", "Сбор структурированных данных с лимитами и экспортом."],
      ["code-data-dashboard", "Data Dashboard", "Интерактивные графики, фильтры и загрузка данных."],
    ],
  },
  {
    category: "Данные",
    mode: "data",
    promptLead: "Открой аналитический workspace Malik AI и загрузи структуру решения",
    templates: [
      ["analytics-dashboard", "Analytics Dashboard", "KPI, динамика, сегменты и понятные выводы."],
      ["finance-analytics", "Finance Analytics", "P&L, cash flow, бюджеты и сравнение сценариев."],
      ["executive-kpi-report", "Executive KPI Report", "Краткий отчёт для руководителя с ключевыми сигналами."],
      ["spreadsheet-analyzer", "Spreadsheet Analyzer", "Очистка таблицы, аномалии, тренды и рекомендации."],
      ["document-workspace", "Document Workspace", "Документы, версии, согласования и поиск по содержимому."],
      ["knowledge-base", "Knowledge Base", "Структура знаний, статьи, теги и быстрый поиск."],
      ["roadmap-planner", "Roadmap Planner", "Инициативы, приоритеты, зависимости и сроки."],
      ["okr-tracker", "OKR Tracker", "Цели, ключевые результаты, прогресс и обзоры."],
      ["calendar-workflow", "Calendar Workflow", "События, задачи, напоминания и автоматические сценарии."],
      ["team-wiki", "Team Wiki", "Единое пространство процессов, решений и командных документов."],
    ],
  },
]

function previewUrl(photoId: string) {
  if (photoId.startsWith("pexels:")) {
    const id = photoId.slice("pexels:".length)
    return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=960&h=600&fit=crop`
  }
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=960&h=600&q=82`
}

export const MALIK_TEMPLATES: MalikTemplate[] = GROUPS.flatMap((group, groupIndex) =>
  group.templates.map(([id, title, description], templateIndex) => ({
    id,
    title,
    description,
    category: group.category,
    mode: group.mode,
    preview: previewUrl(PHOTO_IDS[groupIndex * 10 + templateIndex]),
    prompt: `${group.promptLead}: «${title}». ${description} Сделай результат практичным, современным и полностью редактируемым.`,
    featured: FEATURED_IDS.has(id),
  })),
)

export const FEATURED_MALIK_TEMPLATES = MALIK_TEMPLATES.filter((template) => template.featured)

export const HOME_MALIK_TEMPLATES = [
  ...FEATURED_MALIK_TEMPLATES,
  ...MALIK_TEMPLATES.filter((template) => !template.featured),
].slice(0, 40)

export const MALIK_TEMPLATE_CATEGORIES: readonly MalikTemplateCategory[] = GROUPS.map((group) => group.category)

export function targetViewForTemplate(template: MalikTemplate): string {
  switch (template.mode) {
    case "chat":
      return "home"
    case "website":
      return "website-generation"
    case "app":
    case "data":
      return "dashboard-generation"
    case "business":
      return "business-command-center"
    case "image":
      return "photo-generation"
    case "video":
      return "video-generation"
    case "code":
      return "code-generation"
  }
}
