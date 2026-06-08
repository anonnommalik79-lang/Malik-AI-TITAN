import { unsplashPhoto, type VideoClip } from "./section-media"
import { withAmazonMedia, listAmazonMediaAssets } from "./amazon-media"

export { listAmazonMediaAssets }

export type PhotoTemplate = {
  id: string
  title: string
  subtitle: string
  tag: string
  photo: string
  tint: string
  prompt: string
  video?: string
}

export type VideoAiTemplate = {
  id: string
  title: string
  provider: string
  tag: string
  theme: string
  src: string
  poster: string
  prompt: string
  tint: string
}

function pexels(id: number, size: "sd" | "hd" = "hd", fps: 25 | 30 = 25) {
  const spec =
    size === "hd" ? `${id}-hd_1920_1080_${fps}fps` : `${id}-sd_640_360_30fps`
  return `https://videos.pexels.com/video-files/${id}/${spec}.mp4`
}

/** Verified Unsplash — Wikimedia Astana URLs fail in browser embeds */
const ASTANA_HUB = unsplashPhoto("photo-1565008576549-57569a49371d", 900)
const ASTANA_SKYLINE = unsplashPhoto("photo-1578662996442-ab5b5e2b93ea", 900)
const BROADCAST_STUDIO = unsplashPhoto("photo-1585829367313-978306c6eca4", 700)

/** 4 стартовых карточки Home — первая Astana Hub */
const HOME_STARTER_TEMPLATES_BASE: PhotoTemplate[] = [
  {
    id: "astana-hub",
    title: "Astana Hub",
    subtitle: "Технопарк и стартап-экосистема Казахстана: лендинг, питч и demo day.",
    tag: "Astana · Hub",
    photo: ASTANA_HUB,
    tint: "rgba(14, 116, 144, 0.35)",
    prompt:
      "Создай лендинг Astana Hub для AI-стартапа: hero с Байтерек, блок резидентов, программы акселерации, KPI traction и CTA «Подать заявку». Премиальный тёмный UI.",
  },
  {
    id: "digital-bridge",
    title: "Digital Bridge Pitch",
    subtitle: "Инвесторская сцена: one-pager, traction, roadmap и waitlist.",
    tag: "Pitch · Investor",
    photo: unsplashPhoto("photo-1542744173-8e7e53415bb0", 900),
    tint: "rgba(88, 28, 135, 0.5)",
    prompt:
      "Собери pitch-deck для Digital Bridge 2026: проблема, решение, рынок Казахстана, Malik AI, traction, roadmap и слайд Ask.",
  },
  {
    id: "vision-noir",
    title: "Malik Vision Noir",
    subtitle: "Кинематографичный киберпанк-кадр для демо и соцсетей.",
    tag: "Photo · Cinema",
    photo: unsplashPhoto("photo-1518770660439-4636190af475", 900),
    tint: "rgba(15, 23, 42, 0.58)",
    prompt:
      "Кинематографичный киберпанк-кадр: AI-студия ночью в Астане, неон, премиальный SaaS на мониторах, дождь, 16:9.",
  },
  {
    id: "analytics-cockpit",
    title: "Analytics Cockpit",
    subtitle: "KPI-дашборд: рост, очередь генерации, costs и executive summary.",
    tag: "Dashboard · KPI",
    photo: unsplashPhoto("photo-1460925895917-afdab827c52f", 900),
    tint: "rgba(6, 78, 59, 0.48)",
    prompt:
      "Analytics cockpit для AI SaaS: KPI-карты, график генераций, costs по провайдерам, funnel активации.",
  },
]

/** 4 стартовых карточки Home — Amazon CDN paths when NEXT_PUBLIC_AMAZON_MEDIA_BASE is set */
export const HOME_STARTER_TEMPLATES: PhotoTemplate[] = HOME_STARTER_TEMPLATES_BASE.map((template, index) => {
  const amazonIds = ["amz-photo-astana", "amz-photo-studio", "amz-photo-broadcast", "amz-photo-studio"] as const
  return withAmazonMedia(template, amazonIds[index] || "amz-photo-studio")
})

/** 30 казахстанских СМИ / медиа шаблонов — горизонтальная полка внизу Home */
export const KAZAKH_SMI_TEMPLATES: PhotoTemplate[] = [
  withAmazonMedia({ id: "k01", title: "Astana Hub Live", subtitle: "Стрим demo day резидентов", tag: "Astana Hub", photo: ASTANA_HUB, video: pexels(3255275), tint: "rgba(8,145,178,.35)", prompt: "Лендинг Astana Hub: live-стрим demo day, расписание питчей, карта резидентов." }, "amz-photo-astana", "amz-video-cinema"),
  { id: "k02", title: "Хабар News Prime", subtitle: "Главный выпуск: AI и Digital Bridge", tag: "ТВ · Prime", photo: BROADCAST_STUDIO, tint: "rgba(30,58,138,.38)", prompt: "ТВ-шаблон главного выпуска: ведущий, титры, lower-third, тикер новостей Казахстана." },
  { id: "k03", title: "24.kz Digital", subtitle: "Новостной портал с видео-лентой", tag: "Digital · 24.kz", photo: unsplashPhoto("photo-1504711434969-3362f8c7d826", 700), tint: "rgba(67,20,90,.42)", prompt: "Новостной портал 24.kz style: hero-лента, рубрики, live-блок, тёмный premium UI." },
  { id: "k04", title: "Astana TV Studio", subtitle: "Студия прямого эфира EXPO", tag: "Студия · Астана", photo: unsplashPhoto("photo-1574717024653-61fd2cf4d44d", 700), tint: "rgba(15,23,42,.5)", prompt: "ТВ-студия Астаны: панорама EXPO, световые панели, teleprompter, broadcast UI." },
  withAmazonMedia({ id: "k05", title: "Digital Bridge Stage", subtitle: "Сцена форума и метрики на экранах", tag: "Forum · Stage", photo: unsplashPhoto("photo-1540575467063-178a50c2df87", 700), video: pexels(3255275), tint: "rgba(88,28,135,.48)", prompt: "Сайт Digital Bridge: сцена, спикеры, agenda, спонсоры, registration." }, "amz-photo-broadcast", "amz-video-launch"),
  { id: "k06", title: "Qazaqstan Today", subtitle: "Утренний дайджест экономики", tag: "Economy · AM", photo: unsplashPhoto("photo-1504384308090-c894fdcc538d", 700), tint: "rgba(6,78,59,.4)", prompt: "Утренний экономический дайджест: инфографика, курс тенге, нефть, tech M&A." },
  { id: "k07", title: "Baiterek Night", subtitle: "Ночной Астана — кинематограф", tag: "Астана · Night", photo: ASTANA_SKYLINE, tint: "rgba(30,27,75,.4)", prompt: "Промо-ролик ночной Астаны: Байтерек, мосты, неон, drone shots, саунд-дизайн." },
  { id: "k08", title: "Startup Kazakhstan", subtitle: "Карта стартапов и фондов", tag: "VC · Map", photo: unsplashPhoto("photo-1556761175-b413da4baf72", 700), tint: "rgba(17,24,39,.48)", prompt: "Интерактивная карта стартапов РК: фильтры по городам, раунды, контакты фондов." },
  { id: "k09", title: "Tech Orda Stream", subtitle: "Онлайн-школа и вебинары", tag: "EdTech · Live", photo: unsplashPhoto("photo-1522202176988-66273c2fd55f", 700), tint: "rgba(14,116,144,.42)", prompt: "Платформа Tech Orda: расписание вебинаров, чат, записи, сертификаты." },
  { id: "k10", title: "Eurasia Media Hub", subtitle: "Мультиязычный newsroom", tag: "Newsroom · KZ", photo: unsplashPhoto("photo-1585829367313-978306c6eca4", 700), tint: "rgba(67,20,90,.45)", prompt: "Мультиязычный newsroom: KZ/RU/EN ленты, редакторская колонка, fact-check." },
  { id: "k11", title: "FinTech Astana", subtitle: "Банкинг и open API дашборд", tag: "FinTech · API", photo: unsplashPhoto("photo-1551288049-bebda4e38f71", 700), video: pexels(855412), tint: "rgba(6,78,59,.45)", prompt: "FinTech дашборд Астаны: open banking API, транзакции, compliance, alerts." },
  { id: "k12", title: "Sport+ KZ", subtitle: "Лайв-табло и хайлайты", tag: "Sport · Live", photo: unsplashPhoto("photo-1461896836934-ffe607ba8211", 700), tint: "rgba(30,58,138,.42)", prompt: "Спортивный портал: live-табло, хайлайты, статистика, подписка." },
  { id: "k13", title: "Culture Qazaq", subtitle: "Документалистика и архив", tag: "Culture · Doc", photo: unsplashPhoto("photo-1492684223066-81342ee5ff30", 700), tint: "rgba(88,28,135,.4)", prompt: "Культурный архив: документальные серии, таймлайн, подкасты, VR-экскурсии." },
  { id: "k14", title: "Gov Digital KZ", subtitle: "eGov сервисы и очереди", tag: "Gov · eService", photo: unsplashPhoto("photo-1454165804606-c3d57bc86b40", 700), tint: "rgba(15,23,42,.5)", prompt: "Портал eGov: услуги, статусы заявок, уведомления, чат-бот на казахском." },
  { id: "k15", title: "Almaty Creative", subtitle: "Креативные индустрии и фестивали", tag: "Creative · ALA", photo: unsplashPhoto("photo-1516450360562-6aa8e99248fa", 700), tint: "rgba(17,24,39,.45)", prompt: "Алматы creative hub: афиша фестивалей, резиденции, гранты, портфолио." },
  { id: "k16", title: "Energy Kazakhstan", subtitle: "Нефть, газ, green transition", tag: "Energy · KPI", photo: unsplashPhoto("photo-1473341304170-fd45c7b140b0", 700), tint: "rgba(6,78,59,.48)", prompt: "Energy dashboard: добыча, экспорт, ESG, green projects map." },
  { id: "k17", title: "AgriTech Steppe", subtitle: "Умное сельское хозяйство", tag: "Agri · IoT", photo: unsplashPhoto("photo-1625246333195-78d9c38ad449", 700), video: pexels(856973), tint: "rgba(34,197,94,.25)", prompt: "AgriTech платформа: поля, IoT-датчики, урожайность, прогноз погоды." },
  { id: "k18", title: "MedTech Clinic", subtitle: "Телемедицина и записи", tag: "Health · Tele", photo: unsplashPhoto("photo-1576091160399-112ba8d25d1d", 700), tint: "rgba(14,116,144,.4)", prompt: "Телемедицина KZ: запись к врачу, видео-консультация, рецепты, EMR." },
  { id: "k19", title: "Travel Silk Road", subtitle: "Туризм и маршруты Казахстана", tag: "Travel · KZ", photo: unsplashPhoto("photo-1469854523086-cc02fe5d8800", 700), tint: "rgba(30,58,138,.45)", prompt: "Туристический портал: маршруты, отели, визы, 360° туры Чарын/Алтай." },
  { id: "k20", title: "Auto KZ Motors", subtitle: "Авторынок и тест-драйвы", tag: "Auto · KZ", photo: unsplashPhoto("photo-1492144534655-ae79c964c9d7", 700), tint: "rgba(17,24,39,.5)", prompt: "Автопортал Казахстана: каталог, сравнение, кредит-калькулятор, video reviews." },
  { id: "k21", title: "Real Estate Astana", subtitle: "Новостройки и ипотека", tag: "PropTech · AST", photo: unsplashPhoto("photo-1560518883-ce09059eeffa", 700), tint: "rgba(67,20,90,.42)", prompt: "Недвижимость Астаны: карта ЖК, ипотека, 3D-туры квартир." },
  { id: "k22", title: "Edu National", subtitle: "Нац. тестирование и курсы", tag: "Edu · ENT", photo: unsplashPhoto("photo-1523240795612-9a054b0db644", 700), tint: "rgba(30,58,138,.4)", prompt: "Образовательный портал: подготовка к ЕНТ, курсы, прогресс, рейтинг." },
  { id: "k23", title: "Legal KZ Desk", subtitle: "Юридический справочник", tag: "Legal · KZ", photo: unsplashPhoto("photo-1589829545856-d10d557cf95f", 700), video: pexels(855412), tint: "rgba(15,23,42,.38)", prompt: "Legal tech: поиск статей, шаблоны договоров, консультации, календарь." },
  { id: "k24", title: "Crypto & CBDC Lab", subtitle: "Цифровой тенге и DeFi", tag: "CBDC · Lab", photo: unsplashPhoto("photo-1639762681485-074b7f938ba0", 700), tint: "rgba(88,28,135,.45)", prompt: "CBDC sandbox: кошелёк, транзакции, compliance, аналитика." },
  { id: "k25", title: "Defense Tech KZ", subtitle: "Оборонка и кибербезопасность", tag: "Defense · Cyber", photo: unsplashPhoto("photo-1563986768609-322da13575f3", 700), tint: "rgba(6,78,59,.5)", prompt: "Defense tech portal: threat intel, SOC dashboard, training sims." },
  { id: "k26", title: "Space QazaqSat", subtitle: "Спутники и телеметрия", tag: "Space · Sat", photo: unsplashPhoto("photo-1446776811953-b23d57bd21aa", 700), tint: "rgba(30,27,75,.5)", prompt: "Space ops dashboard: спутники, телеметрия, coverage map, alerts." },
  { id: "k27", title: "Music Q-pop", subtitle: "Стриминг и клипы", tag: "Music · Q-pop", photo: unsplashPhoto("photo-1511379934343-6d104a0a0fcd", 700), tint: "rgba(168,85,247,.35)", prompt: "Music streaming KZ: чарты Q-pop, клипы, концерты, подписка." },
  { id: "k28", title: "Food & Halal", subtitle: "Доставка и рестораны", tag: "Food · Halal", photo: unsplashPhoto("photo-1504674900247-0877df9cc836", 700), tint: "rgba(234,88,12,.3)", prompt: "Food delivery KZ: halal-фильтр, меню, трекинг курьера, loyalty." },
  { id: "k29", title: "Weather Steppe", subtitle: "Прогноз и штормы", tag: "Weather · KZ", photo: unsplashPhoto("photo-1592210454359-9043f067919b", 700), video: pexels(3254065), tint: "rgba(14,116,144,.38)", prompt: "Метеопортал: карта штормов, push-алерты, сельхоз-риски." },
  { id: "k30", title: "Malik AI Sovereign", subtitle: "Национальный AI-хаб медиа", tag: "Malik · Sovereign", photo: unsplashPhoto("photo-1485826236979-a878b0e2b822", 700), tint: "rgba(139,92,246,.4)", prompt: "Malik AI Sovereign media hub: генерация новостей, видео, дашборды для СМИ РК." },
]

/** 20 AI video templates — Runway / Kling / Pika style themes (verified Pexels IDs) */
export const VIDEO_AI_TEMPLATES: VideoAiTemplate[] = [
  { id: "v01", title: "Transformer Reveal", provider: "Runway Gen-3", tag: "16:9 · Mech", theme: "Трансформер", src: pexels(3254065), poster: unsplashPhoto("photo-1485826236979-a878b0e2b822", 700), prompt: "Трансформер выходит из дыма на ночном мегаполисе, неон, 4K cinematic.", tint: "rgba(17,24,39,.5)" },
  { id: "v02", title: "Tank Convoy", provider: "Kling 1.6", tag: "21:9 · Military", theme: "Танки", src: pexels(3209828), poster: unsplashPhoto("photo-1563986768609-322da13575f3", 700), prompt: "Колонна танков в пустыне, пыль, закат, drone tracking shot.", tint: "rgba(6,78,59,.45)" },
  { id: "v03", title: "Orbital Strike", provider: "Pika 2.0", tag: "Sci-Fi · Space", theme: "Космос", src: pexels(3129957, "sd"), poster: unsplashPhoto("photo-1446776811953-b23d57bd21aa", 700), prompt: "Орбитальная станция над Землёй, лазерный луч, эпический масштаб.", tint: "rgba(30,27,75,.48)" },
  { id: "v04", title: "Hypercar Launch", provider: "Luma Dream", tag: "Product · Auto", theme: "Машины", src: pexels(3130284, "hd", 30), poster: unsplashPhoto("photo-1492144534655-ae79c964c9d7", 700), prompt: "Гиперкар на трассе ночью, отражения, speed ramp, premium launch.", tint: "rgba(15,23,42,.5)" },
  { id: "v05", title: "Neon Atmosphere", provider: "Runway Gen-3", tag: "Neon · Rain", theme: "Атмосфера", src: pexels(855412), poster: unsplashPhoto("photo-1518770660439-4636190af475", 700), prompt: "Дождливый неоновый город, атмосферная дымка, slow motion.", tint: "rgba(88,28,135,.42)" },
  { id: "v06", title: "Robot Factory", provider: "Kling 1.6", tag: "Industrial", theme: "Роботы", src: pexels(6981411), poster: unsplashPhoto("photo-1518709268805-4e9042af9f8f", 700), prompt: "Роботизированная сборка, искры, конвейер, sci-fi factory.", tint: "rgba(17,24,39,.48)" },
  { id: "v07", title: "Jet Squadron", provider: "Pika 2.0", tag: "Aerial · Combat", theme: "Истребители", src: pexels(2070037, "hd", 30), poster: unsplashPhoto("photo-1451187580459-43490279c0fa", 700), prompt: "Эскадрилья истребителей над облаками, sonic boom, IMAX look.", tint: "rgba(30,58,138,.45)" },
  { id: "v08", title: "Galaxy Drift", provider: "Luma Dream", tag: "Deep Space", theme: "Галактика", src: pexels(7578552, "hd", 30), poster: unsplashPhoto("photo-1614850523459-c2f4c699c52e", 700), prompt: "Полёт сквозь туманность, звёзды, гравитационные линзы.", tint: "rgba(30,27,75,.5)" },
  { id: "v09", title: "Cyber Pursuit", provider: "Runway Gen-3", tag: "Action · Night", theme: "Погоня", src: pexels(3045163, "sd"), poster: unsplashPhoto("photo-1550751827-4bd374c1f58b", 700), prompt: "Ночная погоня по неоновым улицам, motion blur, blade runner mood.", tint: "rgba(88,28,135,.45)" },
  { id: "v10", title: "Storm Front", provider: "Kling 1.6", tag: "Weather · Epic", theme: "Шторм", src: pexels(856973), poster: unsplashPhoto("photo-1592210454359-9043f067919b", 700), prompt: "Суперячейка над степью, молнии, time-lapse атмосфера.", tint: "rgba(14,116,144,.42)" },
  { id: "v11", title: "Aerial Astana", provider: "Pika 2.0", tag: "Drone · KZ", theme: "Астана", src: pexels(3255275), poster: ASTANA_HUB, prompt: "Drone flyover Астаны: Байтерек, мосты, закат, tourism promo.", tint: "rgba(8,145,178,.48)" },
  { id: "v12", title: "Expo Stage", provider: "Luma Dream", tag: "Event · Live", theme: "Сцена", src: pexels(3195394, "sd"), poster: unsplashPhoto("photo-1540575467063-178a50c2df87", 700), prompt: "Сцена Digital Bridge: свет, экраны, аплодисменты, keynote.", tint: "rgba(88,28,135,.4)" },
  { id: "v13", title: "Mech Assembly", provider: "Runway Gen-3", tag: "Mech · HQ", theme: "Мехи", src: pexels(3209828), poster: unsplashPhoto("photo-1535378917042-0408b3ae4b0e", 700), prompt: "Сборка гигантского меха в ангаре, welding sparks, volumetric light.", tint: "rgba(15,23,42,.52)" },
  { id: "v14", title: "Desert Armor", provider: "Kling 1.6", tag: "Military · 4K", theme: "Бронетехника", src: pexels(856973), poster: unsplashPhoto("photo-1579966345462-942bb7f2a283", 700), prompt: "Бронетехника на учениях, пыль, heat haze, documentary style.", tint: "rgba(6,78,59,.48)" },
  { id: "v15", title: "Luxury Sedan", provider: "Pika 2.0", tag: "Auto · Studio", theme: "Седан", src: pexels(3130284, "hd", 30), poster: unsplashPhoto("photo-1503376780353-7e6692767b70", 700), prompt: "Премиальный седан в студии, световые рейки, product spin.", tint: "rgba(17,24,39,.45)" },
  { id: "v16", title: "Arctic Base", provider: "Luma Dream", tag: "Sci-Fi · Cold", theme: "Арктика", src: pexels(6981411), poster: unsplashPhoto("photo-1483664852095-6e1c139ecb83", 700), prompt: "Научная база в арктической буре, аврора, survival mood.", tint: "rgba(14,116,144,.5)" },
  { id: "v17", title: "Data Core", provider: "Runway Gen-3", tag: "Tech · UI", theme: "Дата-центр", src: pexels(855412), poster: unsplashPhoto("photo-1558494949-ef010cbdcc31", 700), prompt: "Flythrough дата-центра, голографические панели, Malik AI UI.", tint: "rgba(30,58,138,.42)" },
  { id: "v18", title: "Explosion Beat", provider: "Kling 1.6", tag: "Action · VFX", theme: "Взрыв", src: pexels(3045163, "sd"), poster: unsplashPhoto("photo-1509245853830-319129049ecd", 700), prompt: "Контролируемый взрыв на съёмочной площадке, shockwave, VFX plate.", tint: "rgba(234,88,12,.35)" },
  { id: "v19", title: "Nebula Birth", provider: "Pika 2.0", tag: "Cosmos · 8K", theme: "Туманность", src: pexels(7578552, "hd", 30), poster: unsplashPhoto("photo-1419242902214-272b896b9a1e", 700), prompt: "Рождение туманности, цветовые волны, Interstellar palette.", tint: "rgba(30,27,75,.45)" },
  { id: "v20", title: "Malik Cinema", provider: "Malik Sovereign", tag: "Brand · Launch", theme: "Malik AI", src: pexels(7578552, "hd", 30), poster: unsplashPhoto("photo-1489599846737-34aac775127d", 700), prompt: "Malik AI product launch: logo reveal, UI, founder, CTA, Digital Bridge.", tint: "rgba(139,92,246,.4)" },
]

/** Photo Generation — 12 уникальных пресетов */
export const PHOTO_STYLE_PRESETS = [
  { id: "cyber", title: "Киберпанк", body: "Неон, дождь, мегаполис ночью.", tag: "Неон · Ночь", photo: unsplashPhoto("photo-1550751827-4bd374c1f58b", 900), tint: "rgba(88,28,135,.45)" },
  { id: "portrait", title: "Неоновый портрет", body: "Кинематографичный портрет со студийным светом.", tag: "Портрет", photo: unsplashPhoto("photo-1534528741775-53994a69daeb", 900), tint: "rgba(30,58,138,.42)" },
  { id: "studio", title: "AI-студия", body: "Тёмная площадка с мониторами и светом.", tag: "Студия", photo: unsplashPhoto("photo-1598483644766-792bd69c9e18", 900), tint: "rgba(15,23,42,.5)" },
  { id: "gallery", title: "Тёмная галерея", body: "Выставочное пространство с драматичным светом.", tag: "Галерея", photo: unsplashPhoto("photo-1541701494587-c21aa1a9c8c5", 900), tint: "rgba(67,20,90,.4)" },
  { id: "cinematic", title: "Кинематограф", body: "Широкий 16:9 с объёмным светом.", tag: "16:9", photo: unsplashPhoto("photo-1485846234645-a62644f84728", 900), tint: "rgba(17,24,39,.48)" },
  { id: "tech", title: "Техно-лаборатория", body: "Футуристичная лаборатория и holographic UI.", tag: "Tech", photo: unsplashPhoto("photo-1518770660439-4636190af475", 900), tint: "rgba(6,78,59,.38)" },
  { id: "astana", title: "Astana Hub", body: "Байтерек и стартап-экосистема Казахстана.", tag: "Astana", photo: ASTANA_HUB, tint: "rgba(8,145,178,.45)" },
  { id: "newsroom", title: "Newsroom", body: "ТВ-студия и broadcast панели.", tag: "СМИ", photo: unsplashPhoto("photo-1585829367313-978306c6eca4", 900), tint: "rgba(30,58,138,.42)" },
  { id: "saas", title: "SaaS Product", body: "Продуктовый кадр на чёрном фоне.", tag: "SaaS", photo: unsplashPhoto("photo-1460925895917-afdab827c52f", 900), tint: "rgba(6,78,59,.4)" },
  { id: "fashion", title: "Fashion Noir", body: "Editorial fashion с контрастным светом.", tag: "Fashion", photo: unsplashPhoto("photo-1509631179647-0177331693ae", 900), tint: "rgba(67,20,90,.42)" },
  { id: "architecture", title: "Architecture", body: "Минималистичная архитектура и стекло.", tag: "Arch", photo: unsplashPhoto("photo-1486406146925-ccea0f0f7f0e", 900), tint: "rgba(15,23,42,.45)" },
  { id: "nature", title: "Steppe Gold", body: "Золотая степь Казахстана на закате.", tag: "KZ · Nature", photo: unsplashPhoto("photo-1506905925346-21bda4d32df4", 900), tint: "rgba(234,179,8,.25)" },
]

export const PHOTO_GALLERY_EXAMPLES = [
  { title: "Неоновый переулок", prompt: "Неоновый переулок под дождём", photo: unsplashPhoto("photo-1518709268805-4e9042af9f8f", 800) },
  { title: "AI-кабина", prompt: "Съёмочная кабина с голографическими экранами", photo: unsplashPhoto("photo-1558618666-fcd25c85cd64", 800) },
  { title: "Космический портрет", prompt: "Астронавт на фоне Земли", photo: unsplashPhoto("photo-1614728894747-a83421e2b124", 800) },
  { title: "Тёмная галерея", prompt: "Выставочный зал с драматичным светом", photo: unsplashPhoto("photo-1541961017774-22349e4a1262", 800) },
  { title: "Astana Skyline", prompt: "Панорама Астаны на закате", photo: ASTANA_SKYLINE },
  { title: "Broadcast Desk", prompt: "СМИ-студия с телесуфлёром", photo: BROADCAST_STUDIO },
]

/** Command Center agents — 8 уникальных */
export const COMMAND_AGENT_PHOTOS = [
  { id: "scout", title: "Data Scout", body: "Сбор сигналов и мониторинг рынка.", photo: unsplashPhoto("photo-1551288049-bebda4e38f71", 600) },
  { id: "insight", title: "Insight Analyst", body: "KPI и инвесторские выводы.", photo: unsplashPhoto("photo-1556761175-b413da4baf72", 600) },
  { id: "content", title: "Content Weaver", body: "Тексты, лендинги, презентации.", photo: unsplashPhoto("photo-1498050108023-c5249f4df085", 600) },
  { id: "validator", title: "Validator Pro", body: "Проверка артефактов перед демо.", photo: unsplashPhoto("photo-1504639725590-34d0984388bd", 600) },
  { id: "media", title: "Media Director", body: "Казахстанские СМИ и эфир.", photo: unsplashPhoto("photo-1585829367313-978306c6eca4", 600) },
  { id: "video", title: "Cinema Ops", body: "Видео-конвейер Runway/Kling.", photo: unsplashPhoto("photo-1489599846737-34aac775127d", 600) },
  { id: "gov", title: "Gov Liaison", body: "eGov и compliance Казахстана.", photo: unsplashPhoto("photo-1454165804606-c3d57bc86b40", 600) },
  { id: "astana", title: "Astana Hub Link", body: "Резиденты и demo day.", photo: ASTANA_HUB },
]

/** AI Generator modes — 6 уникальных */
export const AI_GENERATOR_MODE_PHOTOS = [
  { id: "text", photo: unsplashPhoto("photo-1456513080510-7bf3a84b82f8", 700) },
  { id: "code", photo: unsplashPhoto("photo-1555066931-4365d14bab8c", 700) },
  { id: "photo", photo: unsplashPhoto("photo-1541701494587-c21aa1a9c8c5", 700) },
  { id: "video", photo: unsplashPhoto("photo-1478720568477-152d9b8e9fcd", 700) },
  { id: "website", photo: unsplashPhoto("photo-1522071820081-009f0129c71c", 700) },
  { id: "landing", photo: unsplashPhoto("photo-1497215728101-856f4ea42174", 700) },
]

/** Website templates — 8 уникальных */
export const WEBSITE_TEMPLATE_PHOTOS = [
  { id: "saas", photo: unsplashPhoto("photo-1460925895917-afdab827c52f", 700) },
  { id: "startup", photo: unsplashPhoto("photo-1522202176988-66273c2fd55f", 700) },
  { id: "enterprise", photo: unsplashPhoto("photo-1486406146925-ccea0f0f7f0e", 700) },
  { id: "portfolio", photo: unsplashPhoto("photo-1507003211169-0a1dd7228f2d", 700) },
  { id: "astana", photo: ASTANA_HUB },
  { id: "media", photo: unsplashPhoto("photo-1504711434969-3362f8c7d826", 700) },
  { id: "fintech", photo: unsplashPhoto("photo-1551288049-bebda4e38f71", 700) },
  { id: "travel", photo: unsplashPhoto("photo-1469854523086-cc02fe5d8800", 700) },
]

export function videoClipFromTemplate(t: VideoAiTemplate): VideoClip {
  return { src: t.src, poster: t.poster }
}
