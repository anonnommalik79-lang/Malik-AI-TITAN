/**
 * Autonomous Company: the eight agents, and the templates that start them.
 *
 * The agents are not decoration. Each one is a real business mode that already
 * exists in lib/business/modes.ts and already runs through POST
 * /api/business/run - the endpoint the section has always used. The pipeline is
 * those modes in the order a company is actually built, each one handed the
 * brief plus what the agents before it produced.
 *
 * That ordering is the whole idea: the market research is written before the
 * product is scoped, the product is scoped before the brand is written, and the
 * sales scripts are written knowing what the brand said. Running the same eight
 * modes in isolation would produce eight documents about eight different
 * companies.
 */

import type { BusinessModeId } from "./types"

export type AgentId = "ceo" | "research" | "coder" | "design" | "marketing" | "sales" | "support" | "analyst"

export type AutonomousAgent = {
  id: AgentId
  /** Shown on the chip, in the reference's own wording. */
  name: string
  role: string
  /** The mode this agent actually runs. Every one of these exists. */
  mode: BusinessModeId
  /** What this agent is told to produce, appended to the brief. */
  brief: string
}

export const AUTONOMOUS_AGENTS: AutonomousAgent[] = [
  {
    id: "ceo",
    name: "CEO",
    role: "Стратегия",
    mode: "ceo-decision",
    brief: "Определи стратегию запуска: во что именно вкладываться первым, что отложить, где главный риск и на чём бизнес заработает.",
  },
  {
    id: "research",
    name: "Research",
    role: "Рынок",
    mode: "business-war-map",
    brief: "Разбери рынок: спрос, конкуренты, свободные ниши и каналы, через которые придут первые клиенты.",
  },
  {
    id: "coder",
    name: "Coder",
    role: "Продукт",
    mode: "mvp-cut",
    brief: "Собери продукт и сайт: что входит в первую версию, из чего она состоит и что можно выкинуть без потери смысла.",
  },
  {
    id: "design",
    name: "Design",
    role: "Бренд",
    mode: "brand-voice",
    brief: "Собери бренд: имя, характер, как он разговаривает, как выглядит и чем отличается от соседей по полке.",
  },
  {
    id: "marketing",
    name: "Marketing",
    role: "Контент",
    mode: "tiktok-reels-engine",
    brief: "Сделай контент и продвижение: о чём говорить, в каком формате и что публиковать в первый месяц.",
  },
  {
    id: "sales",
    name: "Sales",
    role: "Лиды",
    mode: "ai-sales-manager",
    brief: "Построй привлечение клиентов: откуда идут заявки, что им отвечают и как доводят до оплаты.",
  },
  {
    id: "support",
    name: "Support",
    role: "Клиенты",
    mode: "customer-pain",
    brief: "Разбери работу с клиентами: чего они боятся, о чём спрашивают и что удерживает их после первой покупки.",
  },
  {
    id: "analyst",
    name: "Analyst",
    role: "Рост",
    mode: "revenue-engine",
    brief: "Собери экономику и рост: на чём деньги, какие цифры смотреть еженедельно и что двигать, чтобы выручка росла.",
  },
]

export type TemplateCategory =
  | "Все"
  | "Онлайн-бизнес"
  | "Услуги"
  | "E-commerce"
  | "Технологии"
  | "Офлайн"
  | "Инвестиции"
  | "Мои"

export const TEMPLATE_CATEGORIES: Array<{ id: TemplateCategory; label: string }> = [
  { id: "Все", label: "Все шаблоны" },
  { id: "Онлайн-бизнес", label: "Онлайн-бизнес" },
  { id: "Услуги", label: "Услуги" },
  { id: "E-commerce", label: "E-commerce" },
  { id: "Технологии", label: "Технологии" },
  { id: "Офлайн", label: "Офлайн" },
  { id: "Инвестиции", label: "Инвестиции" },
  { id: "Мои", label: "Мои шаблоны" },
]

export type BusinessTemplate = {
  id: string
  title: string
  description: string
  category: Exclude<TemplateCategory, "Все" | "Мои">
  image: string
  /** Fills the composer. */
  prompt: string
  /** Fills the controls beside it, where the template implies an answer. */
  market?: string
  country?: string
  budget?: string
  requirements?: string
  /**
   * What someone who has actually run this business would insist on.
   *
   * This is the difference between a template and a placeholder. A one-line
   * prompt gets a generic company back, because the model has nothing to work
   * against except the words "кофейня" or "SaaS". These lines are handed to
   * every one of the eight agents, so the market research, the product scope,
   * the brand and the sales plan are all argued against the same set of real
   * constraints - the decisions this business actually turns on, and the ways
   * it actually fails.
   *
   * They deliberately contain no invented prices, salaries, rents or laws.
   * A fabricated number is worse than no number: the next agent treats it as
   * established and builds a plan on top of it. These say what to work out and
   * how, and the run says what still has to be checked on the ground.
   */
  playbook: string[]
  /** The numbers that decide whether this particular business lives. */
  metrics: string[]
}

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: "coffee",
    title: "Кофейня",
    description: "Полный запуск: бренд, меню, маркетинг, персонал.",
    category: "Офлайн",
    image: "/business/templates/coffee.webp",
    prompt: "Создай автономную кофейню в Казахстане: бренд, меню, сайт, маркетинг, персонал, CRM, продажи.",
    market: "Общепит",
    country: "Казахстан",
    budget: "до 10 млн ₸",
    requirements: "Одна точка, команда до 5 человек",
    playbook: [
      "Место решает больше, чем кофе: считай пешеходный трафик у конкретной двери в конкретные часы, а не «проходимость района».",
      "Экономика точки держится на среднем чеке и количестве чеков за смену. Обе цифры надо посчитать до того, как подписана аренда, а не после.",
      "Себестоимость чашки — это не зерно. Это зерно, молоко, стакан, крышка, сахар, сироп, потери на настройке помола и списание в конце дня.",
      "Аренда, съедающая больше пятой части прогнозной выручки, убивает точку тихо и за несколько месяцев. Проверь этот порог первым.",
      "Второй продукт (выпечка, завтраки) обычно даёт больше маржи, чем кофе, и решается на старте, а не «когда пойдёт».",
      "Один бариста не закрывает 12-часовую смену. Считай фонд оплаты сразу на две смены плюс подмену.",
      "Первые деньги приносят не реклама, а постоянные гости в радиусе трёхсот метров. План первых тридцати дней должен быть про них.",
      "Оборудование в аренду или в рассрочку меняет всю картину вложений — рассмотри оба сценария, а не только покупку.",
    ],
    metrics: [
      "Средний чек и количество чеков в смену",
      "Себестоимость чашки со всеми расходниками и списанием",
      "Аренда как доля выручки",
      "Фонд оплаты труда как доля выручки",
      "Точка безубыточности в чеках в день",
      "Доля постоянных гостей к концу третьего месяца",
    ],
  },
  {
    id: "apparel",
    title: "Бренд одежды",
    description: "Дизайн, производство, онлайн-продажи.",
    category: "E-commerce",
    image: "/business/templates/apparel.webp",
    prompt: "Создай бренд одежды: позиционирование, дизайн, производство, интернет-магазин, контент, маркетинг и продажи.",
    market: "Fashion / D2C",
    country: "Казахстан",
    budget: "до 5 млн ₸",
    requirements: "Небольшие партии, продажи через Instagram и сайт",
    playbook: [
      "Бренд одежды умирает не от плохого дизайна, а от денег, замороженных в непроданном размерном ряду. Размерная сетка и глубина закупки — первое решение, а не последнее.",
      "Первая партия существует, чтобы проверить спрос, а не чтобы заполнить склад. Определи минимальный тираж, который даёт ответ.",
      "Посадка важнее принта. Один хорошо сидящий базовый силуэт продаётся годами, коллекция из десяти сырых — ни разу.",
      "Считай маржу после возвратов, доставки в обе стороны и упаковки, а не после себестоимости пошива.",
      "Производство: свой цех, аренда мощностей или подряд — у каждого варианта своя минимальная партия и свой срок. Выбери и обоснуй.",
      "Контент — это часть себестоимости. Съёмка, модель, ретушь на каждую позицию закладываются в цену изделия.",
      "Продажи через Instagram и через сайт — это две разные воронки с разной ценой заявки. Не смешивай их в один план.",
      "Сезонность решает, что и когда запускать. Привяжи план выпуска к сезону, а не к готовности дизайнера.",
    ],
    metrics: [
      "Маржа на изделие после возвратов, доставки и упаковки",
      "Процент возвратов по размерам",
      "Оборачиваемость: сколько дней партия лежит до продажи",
      "Стоимость привлечения одного покупателя",
      "Доля повторных покупок",
      "Доля распродажи от общего объёма партии",
    ],
  },
  {
    id: "agency",
    title: "Агентство",
    description: "Маркетинг, ИИ, дизайн и разработка.",
    category: "Услуги",
    image: "/business/templates/agency.webp",
    prompt: "Создай AI/SMM агентство: услуги, сайт, CRM, поиск клиентов, продажи и автоматизация.",
    market: "B2B услуги",
    country: "Казахстан",
    budget: "до 2 млн ₸",
    requirements: "Работа удалённо, команда 2–4 человека",
    playbook: [
      "Агентство продаёт время людей. Пока не посчитана загрузка и стоимость часа, любой прайс — угадывание.",
      "Один клиент, дающий больше трети выручки, — это не успех, а риск. План привлечения должен закрывать этот риск с самого начала.",
      "Разница между прибыльным и убыточным агентством — правки. Определи, сколько итераций входит в цену и что считается новой задачей.",
      "Предоплата и этапность решают кассовый разрыв. Опиши схему оплат до того, как опишешь услуги.",
      "Продавать «маркетинг» невозможно. Продаётся конкретный результат за конкретный срок — сформулируй его как оффер.",
      "Кейс — главный инструмент продаж. Первые три проекта делаются ради кейсов, и это закладывается в цену.",
      "ИИ снижает себестоимость производства, а не цену для клиента. Не превращай экономию в скидку.",
      "Удалённая команда 2-4 человека означает, что кто-то один продаёт. Назначь эту роль явно, иначе продаж не будет.",
    ],
    metrics: [
      "Стоимость часа команды и загрузка в процентах",
      "Маржа по каждому проекту после всех правок",
      "Доля выручки от крупнейшего клиента",
      "Средний срок сделки от заявки до предоплаты",
      "Выручка на одного человека в команде",
      "Доля клиентов, продлевающих на второй месяц",
    ],
  },
  {
    id: "shop",
    title: "Онлайн магазин",
    description: "Товары, сайт, логистика, реклама.",
    category: "E-commerce",
    image: "/business/templates/shop.webp",
    prompt: "Создай онлайн-магазин: товары, сайт, платежи, логистика, реклама, CRM и продажи.",
    market: "E-commerce",
    country: "Казахстан",
    budget: "до 7 млн ₸",
    requirements: "Доставка по Казахстану, оплата картой и Kaspi",
    playbook: [
      "Онлайн-магазин — это логистика с витриной, а не витрина с доставкой. Начни с того, как товар доедет и вернётся.",
      "Товар выбирается по марже и весу, а не по интересу основателя. Тяжёлое и дешёвое съедает прибыль доставкой.",
      "Стоимость привлечения покупателя должна быть меньше маржи с первого заказа, иначе рост увеличивает убыток.",
      "Kaspi и карты — разные комиссии, разные сроки поступления денег и разное поведение покупателя. Считай оба канала отдельно.",
      "Маркетплейс и свой сайт конкурируют за один и тот же товар. Реши, что где продаётся и по какой цене, до запуска.",
      "Возвраты и брак закладываются в цену с первого дня, а не списываются на «пока мало данных».",
      "Карточка товара продаёт больше, чем реклама. Фото, размеры, сроки доставки и условия возврата — часть продукта.",
      "Складской остаток — это замороженные деньги. Определи, сколько дней продаж держать в наличии.",
    ],
    metrics: [
      "Маржа с заказа после комиссий, доставки и упаковки",
      "Стоимость привлечения покупателя по каждому каналу",
      "Средний чек и число позиций в заказе",
      "Процент выкупа и процент возвратов",
      "Оборачиваемость склада в днях",
      "Доля повторных заказов за 90 дней",
    ],
  },
  {
    id: "realestate",
    title: "Недвижимость",
    description: "Покупка, аренда, управление, инвестиции.",
    category: "Инвестиции",
    image: "/business/templates/realestate.webp",
    prompt: "Создай бизнес в недвижимости: объекты, сайт, заявки, CRM, маркетинг и сделки.",
    market: "Недвижимость",
    country: "Казахстан",
    budget: "от 30 млн ₸",
    requirements: "Работа с застройщиками и вторичным рынком",
    playbook: [
      "В недвижимости зарабатывают на доступе к объектам и на скорости сделки, а не на сайте. Начни с того, откуда берутся объекты.",
      "Комиссия с застройщика и комиссия со вторички — два разных бизнеса с разным циклом сделки и разными людьми. Не смешивай.",
      "Заявка стоит дорого, а сделка идёт месяцами. Считай экономику на горизонте цикла сделки, а не месяца.",
      "Работа с застройщиками — это договор и условия выплат. Опиши, как и когда приходят деньги.",
      "Юридическая часть сделки — источник и репутации, и риска. Определи, что берёшь на себя, а что нет, и напиши это прямо.",
      "CRM здесь не украшение: клиент, потерянный между звонками, — это потерянная комиссия за месяцы работы.",
      "Инвестиционный клиент и клиент «для себя» покупают разное. Раздели воронки и скрипты.",
      "Не давай юридических гарантий и не выдумывай нормы — назови, что проверяется у юриста и в реестре.",
    ],
    metrics: [
      "Стоимость заявки и стоимость одной сделки",
      "Конверсия из показа в сделку",
      "Средний срок цикла сделки в днях",
      "Средняя комиссия по сегментам",
      "Число активных объектов в работе",
      "Доля сделок по рекомендациям",
    ],
  },
  {
    id: "restaurant",
    title: "Ресторан",
    description: "Концепция, меню, команда, продвижение.",
    category: "Офлайн",
    image: "/business/templates/restaurant.webp",
    prompt: "Создай ресторан: концепция, меню, бренд, персонал, бронирование, маркетинг и продажи.",
    market: "Общепит",
    country: "Казахстан",
    budget: "до 40 млн ₸",
    requirements: "Полный цикл: кухня, зал, доставка",
    playbook: [
      "Ресторан проверяется на цифрах кухни: фудкост по каждому блюду, а не по меню в среднем.",
      "Меню — это инструмент прибыли. Позиции с высокой маржой должны стоять там, где на них смотрят, и продаваться официантами намеренно.",
      "Посадка, оборачиваемость столика и часы загрузки определяют выручку сильнее, чем кухня. Посчитай их до концепции.",
      "Доставка — отдельный бизнес внутри ресторана: своя упаковка, свой фудкост, своя комиссия агрегатора. Считай её отдельным юнитом.",
      "Персонал в общепите текучий. План найма и обучения — часть запуска, а не следствие проблем.",
      "Списания и порционирование съедают маржу тише всего. Опиши контроль с первого дня.",
      "Разрешения, СЭС и пожарная часть — это сроки, а не формальность. Заложи их в график открытия.",
      "Не выдумывай нормы и суммы разрешений — назови, что именно нужно уточнить и у кого.",
    ],
    metrics: [
      "Фудкост по каждому блюду и по меню в целом",
      "Средний чек по залу и по доставке отдельно",
      "Оборачиваемость столика в часы загрузки",
      "Фонд оплаты труда как доля выручки",
      "Процент списаний",
      "Маржа доставки после комиссии агрегатора",
    ],
  },
  {
    id: "fitness",
    title: "Фитнес клуб",
    description: "Оборудование, абонементы, маркетинг.",
    category: "Офлайн",
    image: "/business/templates/fitness.webp",
    prompt: "Создай фитнес-клуб: помещение, оборудование, абонементы, тренеры, приложение, маркетинг и удержание клиентов.",
    market: "Фитнес и здоровье",
    country: "Казахстан",
    budget: "до 60 млн ₸",
    requirements: "Абонементы и групповые программы",
    playbook: [
      "Фитнес — это бизнес удержания, а не продаж. Клуб живёт на продлениях, а умирает на оттоке после второго месяца.",
      "Абонемент — это деньги вперёд за услугу впереди. Раздели полученные деньги и заработанные, иначе касса будет врать.",
      "Ёмкость зала в часы пик определяет потолок выручки. Посчитай его до закупки оборудования.",
      "Оборудование в лизинг против покупки меняет всю модель вложений. Рассмотри оба сценария.",
      "Групповые программы и персональные тренировки — разная маржа и разная загрузка. Реши, на чём зарабатываешь.",
      "Тренер уводит клиентов вместе с собой. Это управленческий вопрос, и решать его надо на этапе найма.",
      "Первые продажи делаются до открытия, по предпродаже. План запуска должен это учитывать.",
      "Аренда помещения под зал — долгий договор. Проверь потолки, вентиляцию и нагрузку на перекрытия прежде, чем считать экономику.",
    ],
    metrics: [
      "Отток клиентов помесячно",
      "Доля продлений абонементов",
      "Выручка на квадратный метр",
      "Загрузка зала в часы пик",
      "Стоимость привлечения одного члена клуба",
      "Доход на одного клиента за всё время",
    ],
  },
  {
    id: "saas",
    title: "SaaS продукт",
    description: "Разработка, монетизация, масштабирование.",
    category: "Технологии",
    image: "/business/templates/saas.webp",
    prompt: "Создай SaaS-продукт: проблема, MVP, тарифы, онбординг, интеграции, маркетинг и продажи.",
    market: "B2B SaaS",
    country: "Глобально",
    budget: "до 3 млн ₸",
    requirements: "Подписка, самостоятельный онбординг",
    playbook: [
      "SaaS начинается с проблемы, за которую уже платят деньгами или чужим временем. Если такой оплаты нет, продукта нет.",
      "MVP — это самый узкий срез, который решает проблему целиком для одного типа пользователя. Не половина функций для всех.",
      "Тарифы должны расти вместе с ценностью для клиента: определи, по какой величине считается цена, и почему именно по ней.",
      "Самостоятельный онбординг означает, что продукт продаёт себя за первые минуты. Опиши первый ценный результат и срок до него.",
      "Отток важнее роста. Продукт с высоким оттоком не чинится маркетингом.",
      "Интеграции решают, останется ли клиент. Выбери две-три, без которых продукт не встроится в работу.",
      "Глобальный рынок означает конкурентов, которые уже есть. Найди их и сформулируй, чем ты отличаешься по существу, а не по слову «удобнее».",
      "Считай экономику на горизонте жизни клиента, а не первого платежа.",
    ],
    metrics: [
      "Месячная повторяющаяся выручка",
      "Отток клиентов и отток выручки",
      "Стоимость привлечения и срок её окупаемости",
      "Доход с клиента за всё время",
      "Доля активации: сколько регистраций доходит до первого результата",
      "Конверсия из бесплатного в платный тариф",
    ],
  },
  {
    id: "logistics",
    title: "Логистика",
    description: "Доставка, склады, партнёры, клиенты.",
    category: "Услуги",
    image: "/business/templates/logistics.webp",
    prompt: "Создай логистическую компанию: маршруты, склад, партнёры, тарифы, CRM, клиенты и продажи.",
    market: "Логистика",
    country: "Казахстан",
    budget: "до 25 млн ₸",
    requirements: "Доставка между городами, работа с маркетплейсами",
    playbook: [
      "Логистика зарабатывает на загрузке обратного рейса. Пустой обратный путь — это и есть убыток.",
      "Тариф считается от километра, веса, объёма и простоя одновременно. Тариф «за доставку» без этой разбивки — потеря денег.",
      "Свой транспорт против наёмного — разная модель и разный риск. Посчитай оба варианта на одном объёме.",
      "Работа с маркетплейсами — это их сроки, их окна приёмки и их штрафы. Проверь требования до подписания.",
      "Ответственность за груз — центральный вопрос. Определи, что покрывается, чем и до какой суммы.",
      "Склад — это не «место», а операция: приёмка, хранение, сборка, отгрузка. Опиши каждую и посчитай.",
      "Клиентов удерживает предсказуемость, а не цена. Срок и его соблюдение — главный продукт.",
      "Топливо и ремонт — переменные, которые ломают тариф. Заложи механизм пересмотра цены.",
    ],
    metrics: [
      "Стоимость километра с учётом топлива, ремонта и амортизации",
      "Процент загрузки обратного рейса",
      "Маржа по каждому маршруту",
      "Доля доставок в срок",
      "Стоимость обработки одной посылки на складе",
      "Доля выручки от крупнейшего клиента",
    ],
  },
  {
    id: "travel",
    title: "Туризм",
    description: "Туры, бронирование, маркетинг, клиенты.",
    category: "Онлайн-бизнес",
    image: "/business/templates/travel.webp",
    prompt: "Создай туристический бизнес: направления, туры, бронирование, сайт, маркетинг и продажи.",
    market: "Туризм",
    country: "Казахстан",
    budget: "до 8 млн ₸",
    requirements: "Выездной туризм и внутренние направления",
    playbook: [
      "Турбизнес живёт на предоплатах и умирает на кассовых разрывах. Опиши движение денег между клиентом, оператором и отелем.",
      "Комиссия агента и собственный турпродукт — два разных бизнеса. Реши, какой из них твой, и почему.",
      "Сезонность здесь жёстче, чем где-либо. План должен показывать, на что живёт бизнес в низкий сезон.",
      "Ответственность за срыв поездки лежит на том, кто продал. Определи границы ответственности и что происходит при отмене.",
      "Заявка приходит задолго до оплаты. Считай воронку по срокам, а не по месяцам.",
      "Повторные клиенты и рекомендации дают основную часть выручки. Работа после поездки важнее рекламы до неё.",
      "Выездной и внутренний туризм — разные документы, разные сроки и разные клиенты. Не описывай их одним планом.",
      "Не выдумывай визовые правила и требования — назови, что нужно проверить и где.",
    ],
    metrics: [
      "Маржа на одного туриста по направлениям",
      "Доля предоплат и разрыв между оплатой и расчётом с оператором",
      "Стоимость заявки и конверсия заявки в оплату",
      "Соотношение выручки высокого и низкого сезона",
      "Доля повторных клиентов и рекомендаций",
      "Процент отмен",
    ],
  },
  {
    id: "courses",
    title: "Онлайн курсы",
    description: "Контент, платформа, продвижение, продажи.",
    category: "Онлайн-бизнес",
    image: "/business/templates/courses.webp",
    prompt: "Создай онлайн-школу: программа, платформа, преподаватели, воронка, маркетинг и продажи.",
    market: "EdTech",
    country: "Казахстан",
    budget: "до 4 млн ₸",
    requirements: "Запись курсов и потоковые группы",
    playbook: [
      "Онлайн-школа продаёт результат ученика, а не часы видео. Сформулируй результат, который можно проверить.",
      "Доходимость до конца курса определяет отзывы, а отзывы определяют следующие продажи. Это не забота о студентах, это экономика.",
      "Запись курса и потоковые группы — разная себестоимость и разная маржа. Считай их отдельно.",
      "Курс устаревает. Заложи стоимость обновления программы в цену.",
      "Преподаватель — узкое место и риск. Определи, что делает школа, а что конкретный человек.",
      "Возвраты в онлайн-образовании — норма, а не сбой. Опиши политику возврата и заложи её в модель.",
      "Бесплатный вход (вебинар, мини-курс) — часть воронки, и у него своя себестоимость. Считай его как канал, а не как маркетинг.",
      "Платформа — это выбор между готовым решением и своим. Реши по срокам и деньгам, а не по гибкости.",
    ],
    metrics: [
      "Стоимость привлечения ученика и маржа с потока",
      "Доходимость до конца курса",
      "Процент возвратов",
      "Конверсия из бесплатного входа в оплату",
      "Доля учеников, покупающих второй продукт",
      "Себестоимость одного потока с преподавателем и проверкой заданий",
    ],
  },
]

/**
 * The template's instruction, as text a person can read and change.
 *
 * This is deliberately not assembled at send time out of hidden fields. It is
 * built once, shown in full on the screen, and whatever stands there is exactly
 * what the eight agents receive. A panel that says "eight industry rules will
 * be applied" and never shows them is asking to be trusted; showing them asks
 * nothing, and lets the person who actually knows his market cross out the line
 * that is wrong for it.
 */
export function templateInstruction(template: BusinessTemplate): string {
  return [
    `ОТРАСЛЕВАЯ ИНСТРУКЦИЯ — ${template.title.toUpperCase()}`,
    "",
    "На чём этот бизнес держится и на чём он ломается. Учитывай в каждой рекомендации:",
    template.playbook.map((line) => `— ${line}`).join("\n"),
    "",
    "Цифры, которые решают исход. Посчитай их и покажи расчёт:",
    template.metrics.map((line) => `— ${line}`).join("\n"),
    "",
    "Не подставляй вымышленные суммы аренды, зарплат, цен, комиссий и норм закона. Где данных нет — назови величину, скажи, как её посчитать и где проверить.",
  ].join("\n")
}

/**
 * The full brief handed to one agent: the idea, the instruction, the context,
 * and what the agents before it produced.
 *
 * The instruction goes to every agent, not just the first one. That is the
 * point of it: if only the researcher were told that a coffee shop lives or
 * dies on rent as a share of revenue, the eight documents would drift apart
 * again, each one arguing from a different idea of the business.
 */
export function agentInput(
  agent: AutonomousAgent,
  brief: string,
  previous: Array<{ agent: AutonomousAgent; content: string }>,
  instruction?: string | null,
) {
  const earlier = previous
    .slice(-3)
    .map((step) => `### ${step.agent.name} (${step.agent.role})\n${step.content.slice(0, 1400)}`)
    .join("\n\n")

  return [
    `ИДЕЯ БИЗНЕСА:\n${brief}`,
    instruction?.trim() || "",
    earlier ? `УЖЕ СДЕЛАНО ДРУГИМИ АГЕНТАМИ:\n${earlier}` : "",
    `ТВОЯ ЗАДАЧА (${agent.name} · ${agent.role}):\n${agent.brief}`,
    "Не повторяй то, что уже написали другие агенты. Продолжай с того места, где они остановились.",
  ].filter(Boolean).join("\n\n")
}

/* ============================================================ STRESS TEST */

/**
 * The ninth stage: the plan is attacked with what the plan itself said.
 *
 * The eight agents build. This one tries to break what they built, and it can
 * only exist because they built it in stages: there are eight real documents to
 * interrogate, so the assumptions it names are quoted out of this plan rather
 * than borrowed from general advice about startups. One prompt to one model
 * cannot do that - it has nothing to read but its own answer.
 *
 * It is a separate button, not a ninth automatic step, because it costs another
 * call and because the interesting moment is choosing to have your own plan
 * taken apart.
 */
export const STRESS_TEST = {
  mode: "reality-check" as BusinessModeId,
  title: "Проверка на прочность",
  subtitle: "План разбирают на допущения — как это сделает инвестор",
}

/**
 * Builds the stress-test input inside a character budget.
 *
 * The budget is real and it bites: checkPromptLength caps the input at 3000
 * characters for a guest and 6000 for a free account, and eight finished
 * documents are far past both. So each stage is given an equal share of what is
 * left after the framing, cut at a sentence boundary rather than mid-word, and
 * the model is told plainly that it is reading excerpts - otherwise it treats a
 * truncated document as a plan that simply stops.
 */
export function stressTestInput(
  brief: string,
  done: Array<{ agent: AutonomousAgent; content: string }>,
  budget: number,
): string {
  const framing = [
    `БИЗНЕС: ${brief}`,
    "",
    `НИЖЕ — ПЛАН, КОТОРЫЙ СОБРАЛИ ${done.length} АГЕНТОВ. Это выдержки, а не полные документы.`,
    "Разбери именно этот план. Каждое допущение цитируй из текста ниже. Не пиши общих истин про бизнес — они здесь бесполезны.",
    "Не выдумывай суммы, ставки и нормы. Если цифры нет — так и скажи, и укажи, где её взять.",
    "",
  ].join("\n")

  const share = Math.max(120, Math.floor((budget - framing.length - 200) / Math.max(1, done.length)))

  const body = done.map((step) => {
    const header = `## ${step.agent.name} — ${step.agent.role}\n`
    const room = Math.max(80, share - header.length)
    let text = step.content.trim()
    if (text.length > room) {
      const cut = text.slice(0, room)
      // Cut at the last sentence end, so the excerpt reads as an excerpt and not
      // as a thought the agent abandoned halfway.
      const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"), cut.lastIndexOf("! "), cut.lastIndexOf("? "))
      text = `${(stop > room * 0.5 ? cut.slice(0, stop + 1) : cut).trim()} […]`
    }
    return header + text
  }).join("\n\n")

  return `${framing}${body}`
}

/* ======================================================== GEMINI RUNTIME */

/**
 * What each agent hands over, section by section.
 *
 * The generic business formats ("Вердикт / Диагноз / Топ-5") were written for
 * one-off questions. A company is not a question: the CEO has to decide, the
 * analyst has to count, the salesperson has to write the actual message. So
 * each agent gets the document a real specialist in that seat would hand the
 * next one, and the model is told to fill it, not to discuss it.
 */
export const AGENT_DELIVERABLES: Record<AgentId, string> = {
  ceo: [
    "## Решение — одна фраза: что строим, для кого и на чём зарабатываем.",
    "## Компания на одной странице — таблица: продукт · клиент (ICP) · его боль · оффер · цена и модель дохода · канал №1 · чем отличаемся.",
    "## Первым делом / позже — таблица: что делаем в первые 30 дней и почему, что сознательно откладываем.",
    "## Главный риск — какая одна вещь убьёт бизнес и как проверить её за неделю дешевле всего.",
    "## Цели на 90 дней — таблица: метрика · цель · срок · кто отвечает.",
  ].join("\n"),
  research: [
    "## Спрос — кто покупает и сколько их: расчёт по формуле (TAM → SAM → SOM), каждое допущение помечено.",
    "## Конкуренты — таблица: игрок · что продаёт · цена (только с источником) · сильная сторона · слабое место.",
    "## Свободная ниша — где конкуренты слабы и почему туда можно войти с этим бюджетом.",
    "## Каналы первых клиентов — таблица: канал · почему он · как проверить за 3 дня · стоимость проверки.",
    "## Проверка в поле — 7 вопросов для интервью с клиентами и что считается подтверждением.",
  ].join("\n"),
  coder: [
    "## Первая версия — 5 функций, без которых продукт не работает, и что выброшено до второй версии.",
    "## Страницы и экраны — таблица: экран · что на нём · какое действие клиента.",
    "## Стек — конкретные технологии и сервисы, почему они, сколько стоят в месяц (или «бесплатный тариф»).",
    "## Данные — сущности и их поля (клиент, заказ, …) в виде таблицы.",
    "## Интеграции — оплата, CRM, мессенджеры, аналитика: что подключаем и в каком порядке.",
    "## План сборки — по неделям, с критерием готовности каждой недели.",
  ].join("\n"),
  design: [
    "## Имя — 3 варианта, выбор и почему. Отметь, что домен и товарный знак надо проверить.",
    "## Позиционирование — одна фраза «для кого, что, в отличие от кого».",
    "## Голос бренда — таблица: как говорим · как не говорим · пример фразы.",
    "## Визуальная система — палитра (HEX), шрифты, стиль фото и иконок, что запрещено.",
    "## Первый экран сайта — заголовок, подзаголовок, кнопка, что на фоне.",
    "## 5 слоганов — коротких, под этот бренд.",
  ].join("\n"),
  marketing: [
    "## Стратегия — 3 темы (столпа) контента и почему они продают этот оффер.",
    "## План на 30 дней — таблица: неделя · формат · тема · хук первых 2 секунд · цель.",
    "## 10 готовых хуков — дословно, под этот продукт.",
    "## 3 сценария роликов — кадр за кадром, с текстом на экране и призывом.",
    "## Бюджет и метрики — сколько тратим, на что, какая цифра считается успехом.",
  ].join("\n"),
  sales: [
    "## Воронка — таблица: этап · что происходит · конверсия (допущение) · инструмент.",
    "## Скрипты — дословно: первое сообщение, ответ на «дорого», дожим, follow-up в WhatsApp и Telegram.",
    "## Возражения — таблица из 6 строк: возражение · ответ · что показать.",
    "## CRM — стадии сделки и обязательные поля.",
    "## Первые 10 продаж — где взять этих людей и что сделать по дням.",
  ].join("\n"),
  support: [
    "## Путь клиента — до покупки, во время, после: где он сомневается и что мы делаем.",
    "## 10 вопросов клиентов — и готовые ответы дословно.",
    "## Удержание — что делаем на 1-й, 7-й и 30-й день после покупки.",
    "## Жалобы — регламент: кто, за сколько времени, что можно предложить.",
    "## Метрики сервиса — что смотрим каждую неделю.",
  ].join("\n"),
  analyst: [
    "## Юнит-экономика — таблица: показатель · формула · значение (из брифа, из плана или «допущение»).",
    "## Точка безубыточности — расчёт по шагам.",
    "## Бюджет запуска — таблица статей в пределах заявленного бюджета, с остатком на непредвиденное.",
    "## Прогноз на 6 месяцев — таблица: месяц · клиенты · выручка · расходы · результат; допущения перечислены под таблицей.",
    "## Дашборд недели — 6 цифр, которые смотрим каждый понедельник, и порог тревоги для каждой.",
    "## Рычаги роста — что двигать первым и насколько это меняет выручку.",
  ].join("\n"),
}

export type CompanyBrief = {
  brief: string
  instruction?: string | null
  market?: string
  country?: string
  budget?: string
  requirements?: string
}

export type PriorStep = { agent: AutonomousAgent; content: string }

const PRIOR_EACH_MAX = 9_000
const PRIOR_TOTAL_MAX = 45_000

function stateBlock(text: string) {
  const index = text.search(/(?:^|\n)#{1,4}\s*(?:company state|состояние компании)/i)
  return index >= 0 ? text.slice(index).trim() : ""
}

/**
 * Everything the agents before this one wrote, as much as fits.
 *
 * Gemini reads a long context without trouble, so the next agent gets the
 * previous documents in full rather than the three-paragraph excerpts the old
 * pipeline could afford. When the total is still too large, the oldest
 * documents shrink first - to their opening and their COMPANY STATE, which is
 * the part written for exactly this handover.
 */
export function priorDocuments(previous: PriorStep[]) {
  const docs = previous.map((step) => {
    const full = step.content.trim()
    if (full.length <= PRIOR_EACH_MAX) return { step, text: full }
    // Too long: keep the opening and, always, the handover at the end.
    const state = stateBlock(full).slice(0, 3_000)
    return { step, text: `${full.slice(0, PRIOR_EACH_MAX - state.length - 10).trim()}\n[…]\n${state}`.trim() }
  })
  let total = docs.reduce((sum, doc) => sum + doc.text.length, 0)
  for (const doc of docs) {
    if (total <= PRIOR_TOTAL_MAX) break
    const state = stateBlock(doc.text)
    const shorter = `${doc.text.slice(0, 1_500).trim()}\n[…]\n${state}`.trim()
    total -= doc.text.length - shorter.length
    doc.text = shorter
  }
  return docs
    .map((doc) => `### ${doc.step.agent.name} · ${doc.step.agent.role}\n${doc.text}`)
    .join("\n\n")
}

function conditions(company: CompanyBrief) {
  return [
    company.market ? `Рынок: ${company.market}` : "",
    company.country ? `Страна: ${company.country}` : "",
    company.budget ? `Бюджет на запуск: ${company.budget}` : "",
    company.requirements ? `Особые требования: ${company.requirements}` : "",
  ].filter(Boolean).join("\n")
}

const QUALITY_BAR = [
  "Планка: так пишет партнёр сильного консалтинга для основателя, который завтра тратит свои деньги. Каждый пункт — решение, число или действие. Никаких «можно рассмотреть», «важно учитывать», «в зависимости от ситуации». Есть выбор — выбери и одной фразой объясни почему.",
  "Цифры бери только из брифа, из найденных источников или считай по формуле, помечая исходные значения словом «допущение». Не выдумывай статистику рынка, цены конкурентов, законы, названия компаний и отзывы. Если числа нет — скажи, как получить его за 1–3 дня.",
  "Формат — Markdown: разделы через ##, таблицы для сравнений и расчётов, нумерованные шаги для действий, **жирным** — ключевые решения. Без вступления, без приветствия, без вопросов пользователю: сразу работа.",
]

function languageLine(language?: string) {
  return language === "en" ? "Write in English." : language === "kk" ? "Жауапты қазақ тілінде жаз." : "Пиши по-русски."
}

export function companySystemPrompt(agent: AutonomousAgent, options: { search?: boolean; language?: string } = {}) {
  return [
    `Ты — ${agent.name} (${agent.role}) в MALIK Autonomous Company: восемь ИИ-агентов строят одну компанию по очереди — ${AUTONOMOUS_AGENTS.map((item) => item.name).join(" → ")}. Каждый получает решения предыдущих и продолжает их, а не начинает заново.`,
    ...QUALITY_BAR,
    options.search
      ? "У тебя есть поиск Google. Проверь спрос, конкурентов и цены на реальных источниках и называй источник рядом с фактом. То, что не нашёл, так и помечай."
      : "",
    languageLine(options.language),
  ].filter(Boolean).join("\n\n")
}

export function companyAgentPrompt(agent: AutonomousAgent, company: CompanyBrief, previous: PriorStep[]) {
  const prior = priorDocuments(previous)
  const facts = conditions(company)
  return [
    `ИДЕЯ БИЗНЕСА:\n${company.brief.trim()}`,
    facts ? `УСЛОВИЯ:\n${facts}` : "",
    company.instruction?.trim() || "",
    prior ? `РЕШЕНИЯ ПРЕДЫДУЩИХ АГЕНТОВ (канон — не меняй их без явной причины):\n\n${prior}` : "",
    `ТВОЯ ЗАДАЧА — ${agent.name} · ${agent.role}:\n${agent.brief}`,
    `СДАЙ ДОКУМЕНТ ИЗ ЭТИХ РАЗДЕЛОВ:\n${AGENT_DELIVERABLES[agent.id]}`,
    "Не повторяй то, что уже решили другие агенты: ссылайся на их решения и иди дальше.",
  ].filter(Boolean).join("\n\n")
}

/** The one page a founder reads first, written after all eight have finished. */
export const SUMMARY_STAGE = {
  id: "summary" as const,
  name: "Итог",
  title: "Итог запуска",
}

export function companySummarySystem(language?: string) {
  return [
    "Ты — управляющий партнёр MALIK Autonomous Company. Восемь агентов только что построили компанию. Твоя работа — одна страница, которую основатель прочитает первой и по которой начнёт действовать завтра утром.",
    ...QUALITY_BAR,
    "Ничего нового не придумывай: всё берётся из документов агентов. Если агенты противоречат друг другу — назови противоречие и выбери одно решение.",
    languageLine(language),
  ].join("\n\n")
}

export function companySummaryPrompt(company: CompanyBrief, previous: PriorStep[]) {
  const facts = conditions(company)
  return [
    `ИДЕЯ БИЗНЕСА:\n${company.brief.trim()}`,
    facts ? `УСЛОВИЯ:\n${facts}` : "",
    `ДОКУМЕНТЫ АГЕНТОВ:\n\n${priorDocuments(previous)}`,
    [
      "СОБЕРИ ИТОГ ИЗ ЭТИХ РАЗДЕЛОВ:",
      "## Компания — пять строк: что продаём, кому, почём, где, почему купят именно у нас.",
      "## Принятые решения — таблица: решение · кто из агентов · почему.",
      "## Цифры, которые проверить первыми — таблица: величина · как посчитать · где взять · срок.",
      "## Первые 7 дней — таблица: день · действие · результат к вечеру.",
      "## Три главных риска — и самый дешёвый способ снять каждый.",
    ].join("\n"),
  ].filter(Boolean).join("\n\n")
}
