/**
 * Malik Site Forge — what each kind of business needs from its site.
 *
 * A blueprint is the brief a good studio would write before designing: which
 * pages exist, what the catalogue is called, whether people order or book,
 * which photographs belong to the subject, and an art direction that fits it.
 * The model writes the copy; the blueprint guarantees the structure, and its
 * fallback copy keeps the site complete when no model answers.
 */

export type ForgeLocale = "ru" | "kk" | "en"
export type DirectionId = "roastery" | "atelier" | "edge" | "clinic" | "market" | "gallery" | "coast"
export type BookingKind = "table" | "appointment" | "consultation" | "stay" | "lesson" | "callback"
export type IconId =
  | "coffee" | "leaf" | "clock" | "pin" | "phone" | "mail" | "bag" | "truck" | "calendar" | "users" | "sparkle" | "heart"
  | "shield" | "scissors" | "dumbbell" | "tooth" | "bed" | "book" | "briefcase" | "camera" | "flower" | "car" | "wifi"
  | "gift" | "check" | "wheat" | "flame" | "home" | "music" | "star"

export const ICONS: readonly IconId[] = ["coffee", "leaf", "clock", "pin", "phone", "mail", "bag", "truck", "calendar", "users", "sparkle", "heart", "shield", "scissors", "dumbbell", "tooth", "bed", "book", "briefcase", "camera", "flower", "car", "wifi", "gift", "check", "wheat", "flame", "home", "music", "star"]

export type FallbackItem = { name: string; description: string; price: number; category: string; badge?: string; photo: string }
export type FallbackCopy = {
  tagline: string
  heroTitle: (brand: string) => string
  heroSubtitle: string
  highlights: Array<{ icon: IconId; title: string; text: string }>
  categories: Array<{ id: string; name: string }>
  items: FallbackItem[]
  aboutTitle: string
  about: string[]
  values: Array<{ title: string; text: string }>
  steps: Array<{ title: string; text: string }>
  faq: Array<{ q: string; a: string }>
  services: string[]
}

export type Blueprint = {
  id: string
  match: RegExp
  direction: DirectionId
  catalog: Record<ForgeLocale, string>
  booking: { kind: BookingKind; label: Record<ForgeLocale, string> }
  /** Whether visitors put things in a basket and send the order. */
  order: boolean
  /** English photo searches: hero, about, booking, then gallery. */
  photos: { hero: string; about: string; booking: string; gallery: string[] }
  /** Topics in the curated library that suit this business. */
  curated: string[]
  fallback: { ru: FallbackCopy; en: FallbackCopy }
}

const COFFEE_RU: FallbackCopy = {
  tagline: "Кофе свежей обжарки и выпечка каждое утро",
  heroTitle: (brand) => `${brand}: кофе, ради которого стоит выйти из дома`,
  heroSubtitle: "Обжариваем зерно небольшими партиями, печём круассаны с утра и варим эспрессо так, как он того заслуживает.",
  highlights: [
    { icon: "flame", title: "Своя обжарка", text: "Зерно обжариваем каждую неделю, поэтому вкус яркий, а не плоский." },
    { icon: "wheat", title: "Утренняя выпечка", text: "Круассаны и булочки выходят из печи к открытию." },
    { icon: "wifi", title: "Можно работать", text: "Быстрый Wi‑Fi, розетки у каждого стола и тихий второй зал." },
    { icon: "bag", title: "С собой за минуту", text: "Оформите заказ на сайте и заберите его без очереди." },
  ],
  categories: [{ id: "coffee", name: "Кофе" }, { id: "cold", name: "Холодные напитки" }, { id: "bakery", name: "Выпечка" }, { id: "desserts", name: "Десерты" }],
  items: [
    { name: "Капучино", description: "Двойной эспрессо и бархатное молоко, 300 мл.", price: 1400, category: "coffee", badge: "Хит", photo: "cappuccino latte art" },
    { name: "Флэт уайт", description: "Больше кофе, меньше молока — для тех, кто любит вкус зерна.", price: 1500, category: "coffee", photo: "flat white coffee cup" },
    { name: "Раф ванильный", description: "Сливки, эспрессо и натуральная ваниль.", price: 1700, category: "coffee", photo: "latte coffee cup" },
    { name: "Фильтр-кофе", description: "Сорт недели, заваренный в воронке. Спросите бариста о вкусе.", price: 1200, category: "coffee", photo: "pour over coffee barista" },
    { name: "Айс латте", description: "Эспрессо, холодное молоко и лёд.", price: 1600, category: "cold", photo: "iced latte glass" },
    { name: "Колд брю", description: "Кофе холодного заваривания, 16 часов настаивания.", price: 1500, category: "cold", badge: "Новинка", photo: "iced coffee glass" },
    { name: "Круассан", description: "Французское масло, хрустящие слои.", price: 900, category: "bakery", photo: "croissant" },
    { name: "Миндальный круассан", description: "С миндальным кремом и лепестками миндаля.", price: 1200, category: "bakery", photo: "croissants bakery" },
    { name: "Чизкейк Нью-Йорк", description: "Плотный сливочный чизкейк на песочной основе.", price: 1800, category: "desserts", photo: "cheesecake slice" },
    { name: "Ягодный тарт", description: "Песочное тесто, заварной крем и сезонные ягоды.", price: 1700, category: "desserts", photo: "berry cake slice" },
  ],
  aboutTitle: "Маленькая обжарка, большой вкус",
  about: [
    "Мы начинали с одной кофемашины и желания варить кофе без компромиссов. Сегодня у нас своя обжарка, но подход остался прежним: свежие зёрна, точные рецепты и внимание к каждому гостю.",
    "Зерно покупаем у проверенных ферм и обжариваем небольшими партиями, чтобы раскрыть характер каждого сорта.",
  ],
  values: [{ title: "Свежесть", text: "От обжарки до чашки — не больше трёх недель." }, { title: "Честность", text: "На каждой пачке — страна, ферма и дата обжарки." }, { title: "Гостеприимство", text: "Запоминаем ваш любимый напиток." }],
  steps: [{ title: "Выберите напитки", text: "Добавьте в корзину кофе, выпечку или десерт." }, { title: "Отправьте заказ", text: "Заказ уходит нам в WhatsApp одним нажатием." }, { title: "Заберите без очереди", text: "Мы приготовим всё к назначенному времени." }],
  faq: [
    { q: "Можно ли заказать заранее?", a: "Да. Соберите заказ на странице меню и отправьте его нам — приготовим к нужному времени." },
    { q: "Есть ли растительное молоко?", a: "Есть овсяное, кокосовое и миндальное — для любого напитка." },
    { q: "Можно ли забронировать стол?", a: "Да, выберите дату, время и число гостей на странице бронирования." },
    { q: "Вы продаёте зерно домой?", a: "Да, зерно нашей обжарки можно купить в кофейне, смолоть под вашу кофеварку." },
  ],
  services: ["Столик в зале", "Столик у окна", "Второй зал для работы"],
}

const COFFEE_EN: FallbackCopy = {
  tagline: "Freshly roasted coffee and pastries every morning",
  heroTitle: (brand) => `${brand}: coffee worth leaving the house for`,
  heroSubtitle: "We roast in small batches, bake croissants at dawn and pull every espresso the way it deserves.",
  highlights: [
    { icon: "flame", title: "Roasted in house", text: "We roast every week, so the cup tastes bright, not flat." },
    { icon: "wheat", title: "Morning pastries", text: "Croissants and buns come out of the oven by opening time." },
    { icon: "wifi", title: "Good for work", text: "Fast Wi‑Fi, sockets at every table and a quiet back room." },
    { icon: "bag", title: "Takeaway in a minute", text: "Order on the site and skip the queue." },
  ],
  categories: [{ id: "coffee", name: "Coffee" }, { id: "cold", name: "Cold drinks" }, { id: "bakery", name: "Bakery" }, { id: "desserts", name: "Desserts" }],
  items: [
    { name: "Cappuccino", description: "Double espresso and velvety milk, 300 ml.", price: 4.5, category: "coffee", badge: "Favourite", photo: "cappuccino latte art" },
    { name: "Flat white", description: "More coffee, less milk — for those who love the bean.", price: 4.8, category: "coffee", photo: "flat white coffee cup" },
    { name: "Vanilla latte", description: "Espresso, steamed milk and real vanilla.", price: 5.2, category: "coffee", photo: "latte coffee cup" },
    { name: "Filter coffee", description: "Single origin of the week, brewed by hand.", price: 4, category: "coffee", photo: "pour over coffee barista" },
    { name: "Iced latte", description: "Espresso, cold milk and ice.", price: 5, category: "cold", photo: "iced latte glass" },
    { name: "Cold brew", description: "Steeped cold for 16 hours.", price: 4.8, category: "cold", badge: "New", photo: "iced coffee glass" },
    { name: "Croissant", description: "French butter, crisp layers.", price: 3.2, category: "bakery", photo: "croissant" },
    { name: "Almond croissant", description: "Almond cream and toasted flakes.", price: 4, category: "bakery", photo: "croissants bakery" },
    { name: "New York cheesecake", description: "Dense, creamy, on a shortbread base.", price: 5.5, category: "desserts", photo: "cheesecake slice" },
    { name: "Berry tart", description: "Shortcrust, custard and seasonal berries.", price: 5.2, category: "desserts", photo: "berry cake slice" },
  ],
  aboutTitle: "A small roastery with big flavour",
  about: [
    "We started with one espresso machine and a refusal to cut corners. Today we roast our own beans, and the approach is the same: fresh coffee, precise recipes and attention to every guest.",
    "We buy from trusted farms and roast in small batches to bring out each origin's character.",
  ],
  values: [{ title: "Freshness", text: "No more than three weeks from roast to cup." }, { title: "Honesty", text: "Every bag shows the country, farm and roast date." }, { title: "Hospitality", text: "We remember your usual." }],
  steps: [{ title: "Pick your drinks", text: "Add coffee, pastries or dessert to the basket." }, { title: "Send the order", text: "It reaches us on WhatsApp in one tap." }, { title: "Collect without queueing", text: "We will have it ready for your time." }],
  faq: [
    { q: "Can I order ahead?", a: "Yes. Build your order on the menu page and send it — we'll have it ready." },
    { q: "Do you have plant milk?", a: "Oat, coconut and almond, for any drink." },
    { q: "Can I book a table?", a: "Yes, pick a date, time and party size on the booking page." },
    { q: "Do you sell beans?", a: "Yes, our roasts are available in store, ground for your brewer." },
  ],
  services: ["Table inside", "Window table", "Quiet work room"],
}

function generic(ru: Partial<FallbackCopy> & Pick<FallbackCopy, "items" | "categories">, base: FallbackCopy): FallbackCopy {
  return { ...base, ...ru }
}

const SERVICE_RU: FallbackCopy = {
  tagline: "Делаем качественно, вовремя и по понятной цене",
  heroTitle: (brand) => `${brand} — сделаем так, как вы хотели`,
  heroSubtitle: "Понятные цены, аккуратная работа и запись в удобное время — без звонков и ожидания.",
  highlights: [
    { icon: "check", title: "Цены заранее", text: "Стоимость услуги видна до записи, без доплат на месте." },
    { icon: "calendar", title: "Запись онлайн", text: "Выберите день и время — мы подтвердим в мессенджере." },
    { icon: "shield", title: "Гарантия", text: "Если что-то не так, исправим бесплатно." },
    { icon: "users", title: "Опытная команда", text: "Работают мастера, которые любят своё дело." },
  ],
  categories: [{ id: "main", name: "Основные услуги" }, { id: "extra", name: "Дополнительно" }],
  items: [],
  aboutTitle: "Работаем на результат, который видно",
  about: ["Мы ценим ваше время: записываем на точное время, работаем аккуратно и честно говорим о сроках и стоимости.", "Каждую работу проверяем перед тем, как отдать клиенту."],
  values: [{ title: "Аккуратность", text: "Чисто, точно, без спешки." }, { title: "Прозрачность", text: "Цена и сроки — до начала работы." }, { title: "Внимание", text: "Слушаем, что вам важно." }],
  steps: [{ title: "Выберите услугу", text: "Посмотрите цены и описание." }, { title: "Запишитесь", text: "Укажите удобные дату и время." }, { title: "Приходите", text: "Мы подтвердим запись и будем ждать вас." }],
  faq: [
    { q: "Как записаться?", a: "На странице записи выберите услугу, дату и время — заявка придёт нам в WhatsApp." },
    { q: "Можно ли перенести запись?", a: "Да, напишите нам заранее — подберём другое время." },
    { q: "Какие способы оплаты?", a: "Наличные, карта и перевод." },
    { q: "Сколько длится услуга?", a: "Длительность указана рядом с каждой услугой." },
  ],
  services: [],
}

const SERVICE_EN: FallbackCopy = {
  tagline: "Quality work, on time, at a clear price",
  heroTitle: (brand) => `${brand} — done the way you wanted`,
  heroSubtitle: "Clear prices, careful work and booking at a time that suits you — no calls, no waiting.",
  highlights: [
    { icon: "check", title: "Prices up front", text: "You see the price before booking, with no surprises." },
    { icon: "calendar", title: "Book online", text: "Pick a day and time — we confirm by message." },
    { icon: "shield", title: "Guarantee", text: "If something is wrong, we fix it for free." },
    { icon: "users", title: "Experienced team", text: "Specialists who care about the result." },
  ],
  categories: [{ id: "main", name: "Main services" }, { id: "extra", name: "Extras" }],
  items: [],
  aboutTitle: "Work you can see",
  about: ["We value your time: exact appointments, careful work and honest timings and prices.", "Every job is checked before we hand it back."],
  values: [{ title: "Care", text: "Clean, precise, unhurried." }, { title: "Clarity", text: "Price and timing before we start." }, { title: "Attention", text: "We listen to what matters to you." }],
  steps: [{ title: "Choose a service", text: "See prices and details." }, { title: "Book", text: "Pick a date and time." }, { title: "Come in", text: "We confirm and wait for you." }],
  faq: [
    { q: "How do I book?", a: "Pick a service, date and time on the booking page — it reaches us on WhatsApp." },
    { q: "Can I reschedule?", a: "Yes, message us in advance and we'll find another time." },
    { q: "How can I pay?", a: "Cash, card or transfer." },
    { q: "How long does it take?", a: "Each service lists its duration." },
  ],
  services: [],
}

const svc = (name: string, description: string, price: number, category: string, photo: string, badge?: string): FallbackItem => ({ name, description, price, category, photo, ...(badge ? { badge } : {}) })

export const BLUEPRINTS: readonly Blueprint[] = [
  {
    id: "coffee",
    match: /коф[еэ]|кофейн|coffee|espresso|эспрессо|бариста|кофехаус|кофе-?бар|пекарн|кондитер|bakery|pastry|выпечк|торт(?:ы|ов)?(?!\p{L})|cake shop|чайхан|чайн(?:ая|ой)|tea\s*house/iu,
    direction: "roastery",
    catalog: { ru: "Меню", kk: "Мәзір", en: "Menu" },
    booking: { kind: "table", label: { ru: "Бронь", kk: "Брондау", en: "Book a table" } },
    order: true,
    photos: { hero: "coffee shop interior", about: "barista making coffee", booking: "cozy cafe table", gallery: ["latte art", "coffee beans roasting", "croissants bakery", "cafe interior", "iced coffee", "cappuccino cup"] },
    curated: ["coffee-interior", "latte", "barista", "coffee-beans", "croissant", "iced-coffee", "cheesecake"],
    fallback: { ru: COFFEE_RU, en: COFFEE_EN },
  },
  {
    id: "restaurant",
    match: /ресторан|кафе|бистро|пиццер|pizza|пицц|суши|sushi|бургер|burger|стейк|steak|гриль|grill|столов|ramen|рамен|паб\b|pub|bar\b|бар\b|кухн|ресторан|мейрамхана|асхана|restaurant|diner|eatery|доставк\p{L}* еды|food delivery/iu,
    direction: "market",
    catalog: { ru: "Меню", kk: "Мәзір", en: "Menu" },
    booking: { kind: "table", label: { ru: "Бронь", kk: "Брондау", en: "Book a table" } },
    order: true,
    photos: { hero: "restaurant interior dinner", about: "chef cooking kitchen", booking: "restaurant table setting", gallery: ["fine dining plate", "chef plating food", "restaurant interior", "burger and fries", "wine glasses table", "steak dinner"] },
    curated: ["restaurant-interior", "fine-dining", "chef", "burger"],
    fallback: {
      ru: generic({
        tagline: "Кухня, к которой хочется вернуться",
        heroTitle: (brand) => `${brand}: ужин, о котором будут вспоминать`,
        heroSubtitle: "Готовим из свежих продуктов, подаём красиво и бережём ваш вечер — от первой тарелки до десерта.",
        highlights: [{ icon: "flame", title: "Открытая кухня", text: "Видно, как готовят ваше блюдо." }, { icon: "leaf", title: "Свежие продукты", text: "Закупаем каждое утро у местных фермеров." }, { icon: "truck", title: "Доставка", text: "Соберите заказ на сайте и отправьте его нам." }, { icon: "users", title: "Банкеты", text: "Зал на 40 гостей для праздников и встреч." }],
        categories: [{ id: "starters", name: "Закуски" }, { id: "mains", name: "Основные блюда" }, { id: "burgers", name: "Бургеры" }, { id: "desserts", name: "Десерты" }],
        items: [
          svc("Брускетта с томатами", "Хрустящий хлеб, томаты, базилик, оливковое масло.", 2400, "starters", "bruschetta tomato"),
          svc("Салат с лососем", "Микс салатов, лосось слабой соли, цитрусовая заправка.", 3900, "starters", "salmon salad plate"),
          svc("Стейк рибай", "Мраморная говядина, соус демиглас, овощи гриль.", 9800, "mains", "steak dinner plate", "Хит"),
          svc("Лосось на гриле", "Филе лосося, пюре из цветной капусты, соус бёр блан.", 7400, "mains", "salmon fillet plate"),
          svc("Паста с морепродуктами", "Тальятелле, креветки, мидии, томатный соус.", 5200, "mains", "seafood pasta"),
          svc("Классический бургер", "Говядина, чеддер, маринованные огурцы, соус.", 3800, "burgers", "cheeseburger", "Хит"),
          svc("Двойной чизбургер", "Две котлеты, двойной сыр, лук.", 4600, "burgers", "double cheeseburger"),
          svc("Тирамису", "Маскарпоне, савоярди, эспрессо.", 2200, "desserts", "tiramisu dessert"),
        ],
        aboutTitle: "Готовим так, как готовили бы для друзей",
        about: ["Наша кухня — это сезонные продукты, честные рецепты и внимание к деталям. Мы не гонимся за модой, мы готовим вкусно.", "Каждое блюдо шеф пробует перед подачей."],
        services: ["Столик на 2", "Столик на 4", "Банкетный зал"],
      }, SERVICE_RU),
      en: generic({
        tagline: "Food you'll want to come back for",
        heroTitle: (brand) => `${brand}: a dinner people remember`,
        heroSubtitle: "Fresh produce, beautiful plates and a calm evening — from the first bite to dessert.",
        highlights: [{ icon: "flame", title: "Open kitchen", text: "Watch your dish being made." }, { icon: "leaf", title: "Fresh produce", text: "Bought every morning from local farms." }, { icon: "truck", title: "Delivery", text: "Build your order on the site and send it to us." }, { icon: "users", title: "Private events", text: "A room for 40 guests." }],
        categories: [{ id: "starters", name: "Starters" }, { id: "mains", name: "Mains" }, { id: "burgers", name: "Burgers" }, { id: "desserts", name: "Desserts" }],
        items: [
          svc("Tomato bruschetta", "Crisp bread, tomatoes, basil, olive oil.", 8, "starters", "bruschetta tomato"),
          svc("Salmon salad", "Leaves, cured salmon, citrus dressing.", 13, "starters", "salmon salad plate"),
          svc("Ribeye steak", "Marbled beef, demi-glace, grilled vegetables.", 32, "mains", "steak dinner plate", "Favourite"),
          svc("Grilled salmon", "Salmon fillet, cauliflower purée, beurre blanc.", 24, "mains", "salmon fillet plate"),
          svc("Seafood pasta", "Tagliatelle, prawns, mussels, tomato sauce.", 18, "mains", "seafood pasta"),
          svc("Classic burger", "Beef, cheddar, pickles, house sauce.", 14, "burgers", "cheeseburger", "Favourite"),
          svc("Double cheeseburger", "Two patties, double cheese, onion.", 17, "burgers", "double cheeseburger"),
          svc("Tiramisu", "Mascarpone, savoiardi, espresso.", 8, "desserts", "tiramisu dessert"),
        ],
        aboutTitle: "Cooking the way we'd cook for friends",
        about: ["Seasonal produce, honest recipes and attention to detail. We don't chase trends — we cook well.", "The chef tastes every dish before it leaves the kitchen."],
        services: ["Table for 2", "Table for 4", "Private room"],
      }, SERVICE_EN),
    },
  },
  {
    id: "beauty",
    match: /салон\s+красот|красот|маникюр|педикюр|ногт|nail|бров|ресниц|lash|brow|макияж|makeup|визаж|косметолог|spa\b|спа\b|массаж|massage|beauty|парикмахер|hair\s*salon|стилист|эпиляц|цвет(?:ы|ов|очн)|флорист|букет|flower|florist|свадеб|wedding/iu,
    direction: "atelier",
    catalog: { ru: "Услуги", kk: "Қызметтер", en: "Services" },
    booking: { kind: "appointment", label: { ru: "Запись", kk: "Жазылу", en: "Book" } },
    order: false,
    photos: { hero: "beauty salon interior", about: "manicure nails salon", booking: "spa relaxation", gallery: ["manicure nails", "hair salon styling", "makeup artist", "spa massage", "skincare products", "beauty salon chair"] },
    curated: [],
    fallback: {
      ru: generic({
        tagline: "Уход, после которого хочется улыбаться",
        heroTitle: (brand) => `${brand}: красота без спешки`,
        heroSubtitle: "Мастера с опытом, стерильные инструменты и запись онлайн в удобное время.",
        highlights: [{ icon: "sparkle", title: "Премиальные материалы", text: "Работаем только с проверенными брендами." }, { icon: "shield", title: "Стерильность", text: "Инструменты проходят полный цикл обработки." }, { icon: "calendar", title: "Онлайн-запись", text: "Выберите мастера, услугу и время за минуту." }, { icon: "heart", title: "Атмосфера", text: "Кофе, плед и спокойная музыка." }],
        categories: [{ id: "nails", name: "Ногти" }, { id: "hair", name: "Волосы" }, { id: "face", name: "Лицо" }, { id: "body", name: "Тело" }],
        items: [
          svc("Маникюр с покрытием", "Обработка, выравнивание, гель-лак. 90 минут.", 8000, "nails", "manicure nails", "Хит"),
          svc("Педикюр", "Аппаратный педикюр с покрытием. 90 минут.", 10000, "nails", "pedicure spa"),
          svc("Стрижка и укладка", "Консультация, стрижка, укладка. 60 минут.", 9000, "hair", "hair salon styling"),
          svc("Окрашивание", "Сложное окрашивание с уходом. От 3 часов.", 25000, "hair", "hair coloring salon"),
          svc("Чистка лица", "Комбинированная чистка и маска. 75 минут.", 14000, "face", "facial skincare treatment"),
          svc("Брови и ресницы", "Коррекция, окрашивание, ламинирование.", 7000, "face", "eyebrow lash beauty"),
          svc("Массаж спины", "Расслабляющий массаж. 45 минут.", 9000, "body", "massage spa"),
        ],
        aboutTitle: "Место, где о вас заботятся",
        about: ["Мы открыли салон, чтобы каждый визит был маленьким отдыхом: без спешки, с вниманием к деталям и честным результатом.", "Наши мастера регулярно учатся и знают, как сохранить здоровье волос, кожи и ногтей."],
        services: ["Маникюр", "Педикюр", "Стрижка", "Окрашивание", "Чистка лица", "Массаж"],
      }, SERVICE_RU),
      en: generic({
        tagline: "Care that makes you smile",
        heroTitle: (brand) => `${brand}: beauty without the rush`,
        heroSubtitle: "Experienced specialists, sterile tools and online booking at a time that suits you.",
        highlights: [{ icon: "sparkle", title: "Premium products", text: "Only brands we trust." }, { icon: "shield", title: "Sterile tools", text: "Full sterilisation after every client." }, { icon: "calendar", title: "Book online", text: "Pick a service and time in a minute." }, { icon: "heart", title: "Calm space", text: "Coffee, blankets and quiet music." }],
        categories: [{ id: "nails", name: "Nails" }, { id: "hair", name: "Hair" }, { id: "face", name: "Face" }, { id: "body", name: "Body" }],
        items: [
          svc("Gel manicure", "Prep, shaping and gel colour. 90 min.", 45, "nails", "manicure nails", "Favourite"),
          svc("Pedicure", "Medical pedicure with colour. 90 min.", 55, "nails", "pedicure spa"),
          svc("Cut and style", "Consultation, cut and blow-dry. 60 min.", 50, "hair", "hair salon styling"),
          svc("Colour", "Balayage or full colour with care. From 3 h.", 140, "hair", "hair coloring salon"),
          svc("Facial", "Deep cleanse and mask. 75 min.", 80, "face", "facial skincare treatment"),
          svc("Brows and lashes", "Shape, tint, lamination.", 40, "face", "eyebrow lash beauty"),
          svc("Back massage", "Relaxing massage. 45 min.", 50, "body", "massage spa"),
        ],
        aboutTitle: "A place where you are looked after",
        about: ["We opened the salon so that every visit feels like a short holiday: unhurried, detailed and honest about results.", "Our specialists keep training to protect the health of hair, skin and nails."],
        services: ["Manicure", "Pedicure", "Haircut", "Colour", "Facial", "Massage"],
      }, SERVICE_EN),
    },
  },
  {
    id: "barber",
    match: /барбер|barber|мужск\p{L}*\s+стрижк|бород|beard|тату|tattoo/iu,
    direction: "edge",
    catalog: { ru: "Услуги", kk: "Қызметтер", en: "Services" },
    booking: { kind: "appointment", label: { ru: "Запись", kk: "Жазылу", en: "Book" } },
    order: false,
    photos: { hero: "barbershop interior", about: "barber cutting hair", booking: "barber chair", gallery: ["barber haircut", "beard trim", "barbershop tools", "barbershop interior", "men haircut fade", "barber shaving"] },
    curated: [],
    fallback: {
      ru: generic({
        tagline: "Мужские стрижки и бритьё без компромиссов",
        heroTitle: (brand) => `${brand}: стрижка, за которой возвращаются`,
        heroSubtitle: "Классика и фейды, борода и королевское бритьё. Запись на точное время.",
        highlights: [{ icon: "scissors", title: "Мастера с опытом", text: "Каждый барбер — от пяти лет практики." }, { icon: "clock", title: "Точно по времени", text: "Не ждёте в очереди: приходите к своей записи." }, { icon: "coffee", title: "Напиток в подарок", text: "Кофе или чай, пока ждёте." }, { icon: "shield", title: "Чистые инструменты", text: "Стерилизация после каждого клиента." }],
        categories: [{ id: "hair", name: "Стрижки" }, { id: "beard", name: "Борода" }, { id: "combo", name: "Комплексы" }],
        items: [
          svc("Мужская стрижка", "Консультация, стрижка, мытьё, укладка. 60 минут.", 6000, "hair", "men haircut barber", "Хит"),
          svc("Фейд", "Плавный переход машинкой и ножницами. 60 минут.", 7000, "hair", "fade haircut"),
          svc("Детская стрижка", "До 12 лет. 40 минут.", 4500, "hair", "kids haircut barber"),
          svc("Моделирование бороды", "Форма, контур, уход. 40 минут.", 4000, "beard", "beard trim barber"),
          svc("Королевское бритьё", "Горячие полотенца и опасная бритва. 45 минут.", 5000, "beard", "barber straight razor shave"),
          svc("Стрижка + борода", "Полный образ за одно посещение. 90 минут.", 9000, "combo", "barbershop haircut beard", "Выгодно"),
        ],
        aboutTitle: "Барбершоп для своих",
        about: ["Мы делаем стрижки, в которых удобно жить: не только в день визита, но и через три недели.", "Внутри — хорошая музыка, кофе и мастера, которые слушают."],
        services: ["Мужская стрижка", "Фейд", "Борода", "Стрижка + борода", "Королевское бритьё"],
      }, SERVICE_RU),
      en: generic({
        tagline: "Men's cuts and shaves, no shortcuts",
        heroTitle: (brand) => `${brand}: the cut you come back for`,
        heroSubtitle: "Classics and fades, beards and hot-towel shaves. Booked to the minute.",
        highlights: [{ icon: "scissors", title: "Experienced barbers", text: "Five years of practice and up." }, { icon: "clock", title: "On time", text: "No queue: come at your booking." }, { icon: "coffee", title: "Drink on us", text: "Coffee or tea while you wait." }, { icon: "shield", title: "Clean tools", text: "Sterilised after every client." }],
        categories: [{ id: "hair", name: "Cuts" }, { id: "beard", name: "Beard" }, { id: "combo", name: "Combos" }],
        items: [
          svc("Men's haircut", "Consult, cut, wash, style. 60 min.", 35, "hair", "men haircut barber", "Favourite"),
          svc("Skin fade", "Clipper and scissor blend. 60 min.", 40, "hair", "fade haircut"),
          svc("Kids' cut", "Under 12. 40 min.", 25, "hair", "kids haircut barber"),
          svc("Beard sculpt", "Shape, line-up, care. 40 min.", 25, "beard", "beard trim barber"),
          svc("Hot towel shave", "Straight razor, hot towels. 45 min.", 30, "beard", "barber straight razor shave"),
          svc("Cut + beard", "The full look in one visit. 90 min.", 55, "combo", "barbershop haircut beard", "Best value"),
        ],
        aboutTitle: "A barbershop for regulars",
        about: ["We cut hair that works not only on the day, but three weeks later.", "Good music, coffee and barbers who listen."],
        services: ["Haircut", "Skin fade", "Beard", "Cut + beard", "Hot towel shave"],
      }, SERVICE_EN),
    },
  },
  {
    id: "fitness",
    match: /фитнес|спортзал|тренаж[её]р|gym|fitness|йог|yoga|пилатес|pilates|кроссфит|crossfit|бокс|boxing|единоборств|танц|dance|тренер|trainer|спортклуб|бассейн/iu,
    direction: "edge",
    catalog: { ru: "Абонементы", kk: "Абонементтер", en: "Memberships" },
    booking: { kind: "lesson", label: { ru: "Пробное", kk: "Сынақ сабақ", en: "Free trial" } },
    order: false,
    photos: { hero: "gym workout training", about: "personal trainer gym", booking: "yoga class studio", gallery: ["gym weights", "yoga class", "boxing training", "fitness group class", "running treadmill", "stretching workout"] },
    curated: [],
    fallback: {
      ru: generic({
        tagline: "Тренировки, после которых хочется прийти снова",
        heroTitle: (brand) => `${brand}: сильнее с каждой неделей`,
        heroSubtitle: "Тренажёрный зал, групповые занятия и тренеры, которые ведут к результату. Первое занятие — бесплатно.",
        highlights: [{ icon: "dumbbell", title: "Современный зал", text: "Свободные веса, тренажёры и функциональная зона." }, { icon: "users", title: "Групповые занятия", text: "Йога, функционал, бокс — каждый день." }, { icon: "heart", title: "Персональный план", text: "Тренер составит программу под вашу цель." }, { icon: "clock", title: "С 7 до 23", text: "Удобно до работы и после." }],
        categories: [{ id: "membership", name: "Абонементы" }, { id: "personal", name: "Персональные" }, { id: "classes", name: "Группы" }],
        items: [
          svc("Месяц безлимит", "Зал и все групповые занятия.", 25000, "membership", "gym workout", "Хит"),
          svc("Полгода", "Зал и группы, заморозка до 30 дней.", 120000, "membership", "gym weights"),
          svc("Год", "Лучшая цена, заморозка до 60 дней.", 210000, "membership", "fitness gym training", "Выгодно"),
          svc("Персональная тренировка", "Работа с тренером один на один. 60 минут.", 8000, "personal", "personal trainer gym"),
          svc("10 персональных", "Пакет занятий с тренером.", 70000, "personal", "personal training session"),
          svc("Разовое групповое", "Йога, функционал или бокс.", 3000, "classes", "yoga class"),
        ],
        aboutTitle: "Клуб, где вас знают по имени",
        about: ["Мы создали пространство, где тренироваться приятно: чисто, просторно и без лишнего шума.", "Тренеры помогут начать с нуля и не бросить через месяц."],
        services: ["Тренажёрный зал", "Йога", "Функциональный тренинг", "Бокс", "Персональная тренировка"],
      }, SERVICE_RU),
      en: generic({
        tagline: "Workouts you'll want to come back to",
        heroTitle: (brand) => `${brand}: stronger every week`,
        heroSubtitle: "A gym floor, group classes and coaches who get you results. First session is free.",
        highlights: [{ icon: "dumbbell", title: "Modern gym", text: "Free weights, machines and a functional zone." }, { icon: "users", title: "Group classes", text: "Yoga, functional, boxing — every day." }, { icon: "heart", title: "Your plan", text: "A coach builds a programme for your goal." }, { icon: "clock", title: "7am to 11pm", text: "Before work or after." }],
        categories: [{ id: "membership", name: "Memberships" }, { id: "personal", name: "Personal training" }, { id: "classes", name: "Classes" }],
        items: [
          svc("Monthly unlimited", "Gym and all group classes.", 60, "membership", "gym workout", "Favourite"),
          svc("Six months", "Gym and classes, 30-day freeze.", 300, "membership", "gym weights"),
          svc("Annual", "Best price, 60-day freeze.", 540, "membership", "fitness gym training", "Best value"),
          svc("Personal session", "One-to-one with a coach. 60 min.", 45, "personal", "personal trainer gym"),
          svc("10 personal sessions", "A coaching package.", 400, "personal", "personal training session"),
          svc("Drop-in class", "Yoga, functional or boxing.", 15, "classes", "yoga class"),
        ],
        aboutTitle: "A club where people know your name",
        about: ["A clean, spacious place to train without the noise.", "Our coaches help you start from zero and keep going."],
        services: ["Gym", "Yoga", "Functional training", "Boxing", "Personal training"],
      }, SERVICE_EN),
    },
  },
  {
    id: "clinic",
    match: /стоматолог|зуб|dent|клиник|clinic|медицин|medical|врач|doctor|ветеринар|vet\b|психолог|therap|лаборатор|анализ\p{L}* крови|диагност|поликлиник|оптика|optic/iu,
    direction: "clinic",
    catalog: { ru: "Услуги и цены", kk: "Қызметтер мен бағалар", en: "Services and prices" },
    booking: { kind: "appointment", label: { ru: "Запись к врачу", kk: "Дәрігерге жазылу", en: "Book a visit" } },
    order: false,
    photos: { hero: "modern dental clinic", about: "doctor consultation patient", booking: "clinic reception", gallery: ["dental clinic equipment", "doctor patient consultation", "clinic interior", "dentist at work", "medical team", "clinic waiting room"] },
    curated: [],
    fallback: {
      ru: generic({
        tagline: "Бережное лечение и понятные цены",
        heroTitle: (brand) => `${brand}: лечение без страха и сюрпризов`,
        heroSubtitle: "Современное оборудование, врачи с опытом и план лечения с ценой до начала работы.",
        highlights: [{ icon: "tooth", title: "Без боли", text: "Современная анестезия и бережные методики." }, { icon: "shield", title: "Гарантия", text: "Гарантия на лечение и протезирование." }, { icon: "check", title: "План и цена заранее", text: "Вы знаете стоимость до начала лечения." }, { icon: "calendar", title: "Запись онлайн", text: "Выберите удобные день и время." }],
        categories: [{ id: "diagnostics", name: "Диагностика" }, { id: "treatment", name: "Лечение" }, { id: "hygiene", name: "Гигиена" }, { id: "aesthetic", name: "Эстетика" }],
        items: [
          svc("Консультация и план лечения", "Осмотр, снимок, план с ценой. 30 минут.", 5000, "diagnostics", "dentist consultation", "Хит"),
          svc("Компьютерная томография", "3D-снимок челюсти.", 12000, "diagnostics", "dental x-ray"),
          svc("Лечение кариеса", "Пломба из светоотверждаемого материала.", 18000, "treatment", "dentist at work"),
          svc("Лечение каналов", "Под микроскопом, за одно-два посещения.", 45000, "treatment", "dental clinic equipment"),
          svc("Профессиональная гигиена", "Ультразвук, Air Flow, полировка.", 20000, "hygiene", "dental hygiene cleaning"),
          svc("Отбеливание", "Безопасное кабинетное отбеливание.", 60000, "aesthetic", "smile teeth whitening"),
        ],
        aboutTitle: "Заботимся о здоровье, а не о продажах",
        about: ["Мы лечим только то, что действительно нужно, и объясняем каждое решение простыми словами.", "Врачи регулярно проходят обучение, а оборудование обновляется."],
        services: ["Консультация", "Лечение", "Гигиена", "Отбеливание", "Имплантация"],
      }, SERVICE_RU),
      en: generic({
        tagline: "Gentle care, clear prices",
        heroTitle: (brand) => `${brand}: treatment without fear or surprises`,
        heroSubtitle: "Modern equipment, experienced doctors and a priced treatment plan before we start.",
        highlights: [{ icon: "tooth", title: "Pain-free", text: "Modern anaesthesia and gentle methods." }, { icon: "shield", title: "Guarantee", text: "On treatment and prosthetics." }, { icon: "check", title: "Plan and price first", text: "You know the cost before treatment." }, { icon: "calendar", title: "Book online", text: "Choose a day and time." }],
        categories: [{ id: "diagnostics", name: "Diagnostics" }, { id: "treatment", name: "Treatment" }, { id: "hygiene", name: "Hygiene" }, { id: "aesthetic", name: "Aesthetics" }],
        items: [
          svc("Consultation and plan", "Exam, X-ray, priced plan. 30 min.", 40, "diagnostics", "dentist consultation", "Favourite"),
          svc("CT scan", "3D jaw scan.", 90, "diagnostics", "dental x-ray"),
          svc("Filling", "Light-cured composite filling.", 120, "treatment", "dentist at work"),
          svc("Root canal", "Under microscope, one or two visits.", 350, "treatment", "dental clinic equipment"),
          svc("Hygiene", "Scaling, Air Flow, polish.", 110, "hygiene", "dental hygiene cleaning"),
          svc("Whitening", "Safe in-office whitening.", 300, "aesthetic", "smile teeth whitening"),
        ],
        aboutTitle: "We care about health, not sales",
        about: ["We treat only what's needed and explain every decision in plain words.", "Our doctors keep training and our equipment is kept current."],
        services: ["Consultation", "Treatment", "Hygiene", "Whitening", "Implants"],
      }, SERVICE_EN),
    },
  },
  {
    id: "hotel",
    match: /отел|гостиниц|hotel|хостел|hostel|глэмпинг|glamping|база отдыха|апартамент|resort|курорт|guest\s*house|гостев\p{L}* дом|туризм|тур\p{L}*\s+агент|travel/iu,
    direction: "coast",
    catalog: { ru: "Номера", kk: "Нөмірлер", en: "Rooms" },
    booking: { kind: "stay", label: { ru: "Бронирование", kk: "Брондау", en: "Book a stay" } },
    order: false,
    photos: { hero: "boutique hotel room", about: "hotel lobby", booking: "hotel bedroom", gallery: ["hotel room interior", "hotel pool", "hotel breakfast", "hotel lobby", "mountain view hotel", "hotel bathroom"] },
    curated: [],
    fallback: {
      ru: generic({
        tagline: "Тишина, вид и завтрак, ради которого стоит проснуться",
        heroTitle: (brand) => `${brand}: место, где хорошо просыпаться`,
        heroSubtitle: "Уютные номера, завтрак включён и бронирование напрямую без комиссии.",
        highlights: [{ icon: "bed", title: "Удобные кровати", text: "Ортопедические матрасы и хлопковое бельё." }, { icon: "coffee", title: "Завтрак включён", text: "Свежая выпечка и горячие блюда каждое утро." }, { icon: "wifi", title: "Быстрый Wi‑Fi", text: "Во всех номерах и на территории." }, { icon: "car", title: "Парковка", text: "Бесплатно для гостей." }],
        categories: [{ id: "rooms", name: "Номера" }, { id: "suites", name: "Люксы" }],
        items: [
          svc("Стандарт", "Двуспальная кровать, 22 м², вид во двор. Цена за ночь.", 28000, "rooms", "hotel room interior"),
          svc("Стандарт с видом", "Кровать king size, 24 м², панорамное окно.", 34000, "rooms", "hotel room view", "Хит"),
          svc("Семейный", "Две комнаты, до 4 гостей, 38 м².", 46000, "rooms", "family hotel room"),
          svc("Люкс", "Гостиная, спальня, ванна, 52 м².", 68000, "suites", "hotel suite luxury"),
        ],
        aboutTitle: "Небольшой отель с большим вниманием",
        about: ["У нас всего несколько номеров, поэтому мы знаем каждого гостя и можем подготовить всё заранее.", "Бронируйте напрямую — без комиссий агрегаторов и с лучшей ценой."],
        services: ["Стандарт", "Стандарт с видом", "Семейный", "Люкс"],
      }, SERVICE_RU),
      en: generic({
        tagline: "Quiet, a view, and a breakfast worth waking up for",
        heroTitle: (brand) => `${brand}: a good place to wake up`,
        heroSubtitle: "Cosy rooms, breakfast included and direct booking without commission.",
        highlights: [{ icon: "bed", title: "Great beds", text: "Orthopaedic mattresses and cotton linen." }, { icon: "coffee", title: "Breakfast included", text: "Fresh pastries and hot dishes every morning." }, { icon: "wifi", title: "Fast Wi‑Fi", text: "In every room." }, { icon: "car", title: "Parking", text: "Free for guests." }],
        categories: [{ id: "rooms", name: "Rooms" }, { id: "suites", name: "Suites" }],
        items: [
          svc("Standard", "Double bed, 22 m², courtyard view. Per night.", 95, "rooms", "hotel room interior"),
          svc("Standard with view", "King bed, 24 m², panoramic window.", 115, "rooms", "hotel room view", "Favourite"),
          svc("Family", "Two rooms, up to 4 guests, 38 m².", 160, "rooms", "family hotel room"),
          svc("Suite", "Living room, bedroom, bath, 52 m².", 230, "suites", "hotel suite luxury"),
        ],
        aboutTitle: "A small hotel with big attention",
        about: ["With only a few rooms we know every guest and prepare everything in advance.", "Book direct — no platform fees and the best price."],
        services: ["Standard", "Standard with view", "Family", "Suite"],
      }, SERVICE_EN),
    },
  },
  {
    id: "shop",
    match: /магазин|shop|store|бутик|одежд|clothing|обув|shoes|кроссовк|sneaker|электроник|electronics|гаджет|ювелир|jewel|косметик|cosmetics|игрушк|toys|товар|каталог товар|e-?commerce|интернет-магазин|онлайн-магазин|дүкен/iu,
    direction: "gallery",
    catalog: { ru: "Каталог", kk: "Каталог", en: "Shop" },
    booking: { kind: "callback", label: { ru: "Консультация", kk: "Кеңес", en: "Ask us" } },
    order: true,
    photos: { hero: "clothing store interior", about: "fashion boutique", booking: "shopping bags", gallery: ["fashion clothing rack", "sneakers product", "fashion model", "boutique interior", "accessories flat lay", "shopping bags"] },
    curated: [],
    fallback: {
      ru: generic({
        tagline: "Вещи, которые хочется носить каждый день",
        heroTitle: (brand) => `${brand}: новая коллекция уже в наличии`,
        heroSubtitle: "Соберите заказ на сайте и отправьте его нам — доставим по городу или подготовим к самовывозу.",
        highlights: [{ icon: "truck", title: "Доставка по городу", text: "В день заказа или на следующий день." }, { icon: "bag", title: "Самовывоз", text: "Подготовим заказ к вашему приходу." }, { icon: "shield", title: "Обмен и возврат", text: "14 дней на обмен без лишних вопросов." }, { icon: "gift", title: "Подарочная упаковка", text: "Бесплатно для любого заказа." }],
        categories: [{ id: "new", name: "Новинки" }, { id: "clothes", name: "Одежда" }, { id: "shoes", name: "Обувь" }, { id: "accessories", name: "Аксессуары" }],
        items: [
          svc("Оверсайз-худи", "Плотный хлопок, 4 цвета.", 18000, "new", "hoodie fashion", "Новинка"),
          svc("Льняная рубашка", "Свободный крой, натуральный лён.", 16000, "clothes", "linen shirt fashion"),
          svc("Прямые джинсы", "Классическая посадка, плотный деним.", 22000, "clothes", "denim jeans"),
          svc("Белые кроссовки", "Натуральная кожа, лёгкая подошва.", 32000, "shoes", "white sneakers", "Хит"),
          svc("Кожаные лоферы", "Мягкая кожа, ручная работа.", 38000, "shoes", "leather loafers shoes"),
          svc("Кожаная сумка", "Вмещает ноутбук 13 дюймов.", 29000, "accessories", "leather bag"),
          svc("Шерстяной шарф", "100% мериносовая шерсть.", 12000, "accessories", "wool scarf"),
        ],
        aboutTitle: "Выбираем вещи так, как выбрали бы для себя",
        about: ["Мы отбираем коллекцию вручную: качественные ткани, удобный крой и честная цена.", "Если сомневаетесь в размере — напишите нам, подскажем."],
        services: ["Подбор размера", "Подбор образа", "Подарок"],
      }, SERVICE_RU),
      en: generic({
        tagline: "Things you'll want to wear every day",
        heroTitle: (brand) => `${brand}: the new collection is in`,
        heroSubtitle: "Build your order on the site and send it — we deliver across the city or prepare it for pickup.",
        highlights: [{ icon: "truck", title: "City delivery", text: "Same day or next day." }, { icon: "bag", title: "Pickup", text: "Ready when you arrive." }, { icon: "shield", title: "Easy returns", text: "14 days to exchange." }, { icon: "gift", title: "Gift wrap", text: "Free on any order." }],
        categories: [{ id: "new", name: "New in" }, { id: "clothes", name: "Clothing" }, { id: "shoes", name: "Shoes" }, { id: "accessories", name: "Accessories" }],
        items: [
          svc("Oversized hoodie", "Heavy cotton, 4 colours.", 60, "new", "hoodie fashion", "New"),
          svc("Linen shirt", "Relaxed fit, pure linen.", 55, "clothes", "linen shirt fashion"),
          svc("Straight jeans", "Classic rise, heavy denim.", 75, "clothes", "denim jeans"),
          svc("White sneakers", "Leather, light sole.", 110, "shoes", "white sneakers", "Favourite"),
          svc("Leather loafers", "Soft leather, handmade.", 130, "shoes", "leather loafers shoes"),
          svc("Leather bag", "Fits a 13-inch laptop.", 99, "accessories", "leather bag"),
          svc("Wool scarf", "100% merino.", 40, "accessories", "wool scarf"),
        ],
        aboutTitle: "We pick things we'd buy ourselves",
        about: ["Hand-picked collection: good fabrics, comfortable cuts, fair prices.", "Not sure about the size? Message us and we'll help."],
        services: ["Size advice", "Styling", "Gift"],
      }, SERVICE_EN),
    },
  },
  {
    id: "studio",
    match: /агентств|agency|студи[яюи]|studio|портфолио|portfolio|фотограф|photograph|дизайн|design|архитект|architect|маркетинг|marketing|smm|продакшн|production|видеограф|ремонт|repair|строител|construction|клининг|cleaning|юрист|юридич|lawyer|law firm|адвокат|нотариус|бухгалтер|accounting|консалтинг|consulting|автосервис|сто\b|car service|шиномонтаж|недвижим|real estate|риелтор|realtor|курс|school|школ|обучени|education|репетитор|tutor/iu,
    direction: "gallery",
    catalog: { ru: "Услуги", kk: "Қызметтер", en: "Services" },
    booking: { kind: "consultation", label: { ru: "Заявка", kk: "Өтінім", en: "Get in touch" } },
    order: false,
    photos: { hero: "modern office team work", about: "team meeting office", booking: "office desk laptop", gallery: ["creative studio workspace", "team brainstorming", "office interior", "designer at work", "laptop workspace", "business meeting"] },
    curated: [],
    fallback: { ru: generic({ items: [svc("Консультация", "Разберём задачу и предложим решение. 30 минут.", 0, "main", "business meeting consultation", "Бесплатно"), svc("Базовый пакет", "Всё необходимое для старта.", 150000, "main", "office team work"), svc("Расширенный пакет", "Полный цикл работ под ключ.", 350000, "main", "team brainstorming", "Хит"), svc("Сопровождение", "Ежемесячная поддержка и отчёты.", 90000, "extra", "laptop workspace")], categories: SERVICE_RU.categories, services: ["Консультация", "Базовый пакет", "Расширенный пакет", "Сопровождение"] }, SERVICE_RU), en: generic({ items: [svc("Consultation", "We look at the task and suggest a solution. 30 min.", 0, "main", "business meeting consultation", "Free"), svc("Starter package", "Everything you need to start.", 900, "main", "office team work"), svc("Full package", "End-to-end delivery.", 2200, "main", "team brainstorming", "Favourite"), svc("Ongoing support", "Monthly support and reports.", 600, "extra", "laptop workspace")], categories: SERVICE_EN.categories, services: ["Consultation", "Starter package", "Full package", "Ongoing support"] }, SERVICE_EN) },
  },
]

export const GENERIC_BLUEPRINT: Blueprint = { ...BLUEPRINTS[BLUEPRINTS.length - 1], id: "generic", match: /$^/ }

/** The blueprint whose subject the request names first. */
export function pickBlueprint(prompt: string): Blueprint {
  const text = String(prompt || "")
  let best: { blueprint: Blueprint; at: number } | null = null
  for (const blueprint of BLUEPRINTS) {
    const match = blueprint.match.exec(text)
    if (match && (!best || match.index < best.at)) best = { blueprint, at: match.index }
  }
  return best?.blueprint || GENERIC_BLUEPRINT
}

export function blueprintById(id: unknown): Blueprint | null {
  return BLUEPRINTS.find((blueprint) => blueprint.id === id) || null
}
