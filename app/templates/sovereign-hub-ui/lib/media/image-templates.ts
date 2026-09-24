/**
 * Templates of the image studio (the "Создать изображение" screen that opens
 * from the "+" menu of the chat and the home composer).
 *
 * Each template is a starting point: a Russian example the user can edit, an
 * English style line added to the request, and an English prompt Malik AI's
 * own premium model uses to paint the template's cover once. Until that cover
 * exists, the card shows a bundled picture that was also made by an image
 * model (FLUX, Kolors, CogView — see public/image-studio/covers/CREDITS.md).
 *
 * Shared by the studio (browser) and the covers route (server): no imports.
 */

export type ImageStudioTab = "images" | "characters" | "edit"

export type ImageTemplateCategory =
  | "popular"
  | "photo"
  | "transport"
  | "architecture"
  | "products"
  | "nature"
  | "interiors"
  | "tech"
  | "abstract"

export type ImageTemplateIcon =
  | "car" | "building" | "mountain" | "shapes" | "package" | "city" | "sofa" | "cpu"
  | "camera" | "coffee" | "radio" | "droplets" | "home" | "brush" | "rocket" | "paw"
  | "wand" | "clapper" | "smile" | "cat" | "compass" | "user" | "ghost" | "heart"

export type ImageTemplate = {
  id: string
  tab: Exclude<ImageStudioTab, "edit">
  title: string
  subtitle: string
  icon: ImageTemplateIcon
  categories: ImageTemplateCategory[]
  /** Editable Russian example put into the prompt when the card is chosen. */
  example: string
  /** English style line appended to the request as "Visual style: …". */
  style: string
  /** English prompt the premium model paints the cover from. No text in the picture. */
  coverPrompt: string
  /** Bundled cover, shown until Malik AI has painted its own. */
  fallback: string
  keywords: string
}

export const IMAGE_TEMPLATE_CATEGORIES: Array<{ id: ImageTemplateCategory | "all"; label: string }> = [
  { id: "popular", label: "Популярные" },
  { id: "photo", label: "Фотография" },
  { id: "transport", label: "Транспорт" },
  { id: "architecture", label: "Архитектура" },
  { id: "products", label: "Продукты" },
  { id: "nature", label: "Природа" },
  { id: "interiors", label: "Интерьеры" },
  { id: "tech", label: "Технологии" },
  { id: "abstract", label: "Абстракция" },
  { id: "all", label: "Все шаблоны" },
]

const NO_TEXT = "no text, no letters, no watermark, no logos"
const cover = (id: string) => `/image-studio/covers/${id}.webp`

export const IMAGE_TEMPLATES: ImageTemplate[] = [
  // ------------------------------------------------------------ popular eight
  {
    id: "cars", tab: "images", title: "Автомобили", subtitle: "Спорткары, классика и концепты", icon: "car",
    categories: ["popular", "transport", "photo"],
    example: "Чёрный спорткар на мокрой ночной улице, отражения неона в асфальте",
    style: "premium automotive photography, low camera angle, glossy paint reflections, dramatic rim light, shallow depth of field, photorealistic",
    coverPrompt: `A sleek matte black modern sports car parked on a wet city street at night, neon reflections on the asphalt, low angle three-quarter view, cinematic rim light, premium automotive advertising photograph, photorealistic, ${NO_TEXT}`,
    fallback: cover("cars"), keywords: "машина авто спорткар car суперкар ретро",
  },
  {
    id: "architecture", tab: "images", title: "Архитектура", subtitle: "Здания, формы и пространство", icon: "building",
    categories: ["popular", "architecture", "photo"],
    example: "Футуристичный музей из белого бетона с плавными изгибами на закате",
    style: "architectural photography, clean geometry, golden hour light, symmetrical composition, ultra detailed materials",
    coverPrompt: `A futuristic white concrete museum with flowing curved facades at golden hour, reflecting pool in front, clean geometry, architectural photography, wide angle, photorealistic, ${NO_TEXT}`,
    fallback: cover("architecture"), keywords: "здание дом архитектура небоскрёб храм building",
  },
  {
    id: "nature", tab: "images", title: "Природа и пейзажи", subtitle: "Горы, океаны и закаты", icon: "mountain",
    categories: ["popular", "nature", "photo"],
    example: "Горное озеро в тумане на рассвете, отражение пиков в воде",
    style: "epic landscape photography, soft atmospheric light, rich natural colors, wide angle, crisp detail",
    coverPrompt: `A misty alpine lake at sunrise with snowy mountain peaks reflected in still water, pine forest, soft golden light, epic landscape photography, photorealistic, ${NO_TEXT}`,
    fallback: cover("nature"), keywords: "пейзаж горы лес море океан закат природа landscape",
  },
  {
    id: "abstract", tab: "images", title: "Абстракция", subtitle: "Формы, свет и текстуры", icon: "shapes",
    categories: ["popular", "abstract"],
    example: "Переливающиеся стеклянные волны с неоновым свечением на чёрном фоне",
    style: "abstract digital art, iridescent materials, flowing shapes, volumetric light, high contrast, 3D render",
    coverPrompt: `Abstract flowing iridescent glass ribbons glowing with neon light on a pure black background, smooth curves, volumetric light, premium 3D render, ${NO_TEXT}`,
    fallback: cover("abstract"), keywords: "абстракция формы неон узор 3d art",
  },
  {
    id: "products", tab: "images", title: "Продукты", subtitle: "Предметная съёмка для брендов", icon: "package",
    categories: ["popular", "products", "photo"],
    example: "Механические часы на тёмном камне, мягкий студийный свет, капли воды",
    style: "luxury product photography, studio lighting, soft shadows, macro detail, clean premium background",
    coverPrompt: `A luxury mechanical wristwatch with a skeleton dial resting on dark slate stone, water droplets, soft studio lighting, macro product photography, photorealistic, ${NO_TEXT}`,
    fallback: cover("products"), keywords: "товар продукт часы духи упаковка реклама product",
  },
  {
    id: "city", tab: "images", title: "Города и урбанистика", subtitle: "Улицы, небоскрёбы, ночные огни", icon: "city",
    categories: ["popular", "architecture", "photo"],
    example: "Ночной мегаполис с высоты, огни небоскрёбов и светящиеся дороги",
    style: "cinematic urban photography, night city lights, long exposure light trails, moody atmosphere",
    coverPrompt: `An aerial view of a glowing megacity at blue hour, illuminated skyscrapers, light trails on the avenues, cinematic urban photography, photorealistic, ${NO_TEXT}`,
    fallback: cover("city"), keywords: "город улица мегаполис ночь небоскрёб city urban",
  },
  {
    id: "interiors", tab: "images", title: "Интерьеры", subtitle: "Уютные и дизайнерские пространства", icon: "sofa",
    categories: ["popular", "interiors", "photo"],
    example: "Светлая гостиная в скандинавском стиле с большим окном и растениями",
    style: "interior design photography, natural window light, warm materials, magazine quality, balanced composition",
    coverPrompt: `A bright Scandinavian living room with a large window, linen sofa, oak floor, indoor plants, warm natural light, interior design magazine photograph, photorealistic, ${NO_TEXT}`,
    fallback: cover("interiors"), keywords: "интерьер комната квартира дизайн гостиная спальня interior",
  },
  {
    id: "tech", tab: "images", title: "Технологии и миры", subtitle: "Роботы, sci-fi и будущее", icon: "cpu",
    categories: ["popular", "tech"],
    example: "Гуманоидный робот в футуристичной лаборатории, голубое свечение",
    style: "cinematic sci-fi concept art, futuristic technology, volumetric lighting, highly detailed, photorealistic render",
    coverPrompt: `A sleek humanoid robot in a futuristic laboratory with holographic displays, cool volumetric light, cinematic science fiction concept art, photorealistic render, ${NO_TEXT}`,
    fallback: cover("tech"), keywords: "технологии робот космос будущее sci-fi tech киберпанк",
  },

  // ------------------------------------------------------------- more images
  {
    id: "portrait", tab: "images", title: "Портреты", subtitle: "Студийный свет и характер", icon: "camera",
    categories: ["photo"],
    example: "Портрет девушки в уютном кафе, тёплый свет ламп, мягкий фон",
    style: "professional portrait photography, 85mm lens, soft key light, natural skin texture, shallow depth of field",
    coverPrompt: `An editorial portrait of a young woman in a cozy cafe, warm lamp light, soft bokeh background, 85mm lens, natural skin texture, photorealistic, ${NO_TEXT}`,
    fallback: cover("portrait"), keywords: "портрет лицо человек фото portrait",
  },
  {
    id: "food", tab: "images", title: "Еда и напитки", subtitle: "Аппетитная фуд-съёмка", icon: "coffee",
    categories: ["products", "photo"],
    example: "Свежие круассаны и капучино на деревянном столе, утренний свет",
    style: "appetizing food photography, natural side light, shallow depth of field, rich textures, editorial styling",
    coverPrompt: `Freshly baked croissants and a cappuccino on a rustic wooden table, morning side light, steam, appetizing food photography, photorealistic, ${NO_TEXT}`,
    fallback: cover("food"), keywords: "еда напиток кофе ресторан блюдо food",
  },
  {
    id: "retro", tab: "images", title: "Ретро-техника", subtitle: "Плёнка, винтаж и гаджеты", icon: "radio",
    categories: ["products", "tech"],
    example: "Винтажная плёночная камера на столе, вокруг разлетаются фотографии",
    style: "vintage film photography, warm analog tones, film grain, nostalgic mood, detailed textures",
    coverPrompt: `A vintage instant film camera on a worn wooden table with polaroid photos flying around, warm analog tones, film grain, nostalgic photograph, ${NO_TEXT}`,
    fallback: cover("retro"), keywords: "ретро винтаж плёнка камера гаджет vintage",
  },
  {
    id: "splash", tab: "images", title: "Жидкость и всплески", subtitle: "Вода, стекло, стоп-кадр", icon: "droplets",
    categories: ["abstract", "products"],
    example: "Всплеск воды в форме сердца, замороженное движение, солнечный свет",
    style: "high-speed photography, frozen motion, crystal clear liquid, backlit droplets, studio precision",
    coverPrompt: `A splash of crystal clear water frozen in mid-air, backlit droplets sparkling, high-speed photography, clean bright background, ${NO_TEXT}`,
    fallback: cover("splash"), keywords: "вода всплеск жидкость стекло splash",
  },
  {
    id: "miniature", tab: "images", title: "Миниатюры", subtitle: "Игрушечные миры и диорамы", icon: "home",
    categories: ["abstract", "architecture"],
    example: "Пряничный домик в снегу с крошечными окнами и огоньками",
    style: "tilt-shift miniature diorama, handcrafted details, soft macro lighting, playful and cozy",
    coverPrompt: `A detailed handcrafted miniature diorama of a snowy village with tiny glowing windows, tilt-shift macro photography, cozy soft light, ${NO_TEXT}`,
    fallback: cover("miniature"), keywords: "миниатюра диорама игрушка домик miniature",
  },
  {
    id: "ink", tab: "images", title: "Живопись и тушь", subtitle: "Картины в классических техниках", icon: "brush",
    categories: ["abstract", "nature"],
    example: "Горный пейзаж с пагодой в технике китайской туши, красное солнце",
    style: "traditional ink wash painting, expressive brush strokes, rice paper texture, minimal palette",
    coverPrompt: `A traditional ink wash painting of misty mountains and a pagoda with a red sun, expressive brush strokes, rice paper texture, ${NO_TEXT}`,
    fallback: cover("ink"), keywords: "живопись картина тушь акварель масло painting art",
  },
  {
    id: "future", tab: "images", title: "Транспорт будущего", subtitle: "Космолёты, дроны и концепты", icon: "rocket",
    categories: ["transport", "tech"],
    example: "Космический корабль садится на неоновую платформу мегаполиса",
    style: "futuristic vehicle concept art, sleek industrial design, cinematic lighting, highly detailed render",
    coverPrompt: `A sleek futuristic spaceship landing on a glowing platform above a neon megacity at dusk, cinematic concept art, highly detailed render, ${NO_TEXT}`,
    fallback: cover("future"), keywords: "космос корабль дрон будущее транспорт spaceship",
  },
  {
    id: "animals", tab: "images", title: "Животные", subtitle: "Звери и птицы крупным планом", icon: "paw",
    categories: ["nature", "photo"],
    example: "Снежный барс на скале в горах, мягкий снег, взгляд в камеру",
    style: "wildlife photography, telephoto lens, sharp fur detail, natural habitat, soft background",
    coverPrompt: `A snow leopard resting on a rocky ledge in falling snow, looking at the camera, wildlife telephoto photography, sharp fur detail, photorealistic, ${NO_TEXT}`,
    fallback: cover("animals"), keywords: "животное зверь птица кот собака animal",
  },

  // --------------------------------------------------------------- characters
  {
    id: "char-fantasy", tab: "characters", title: "Фэнтези-герой", subtitle: "Крылья, магия и доспехи", icon: "wand",
    categories: ["popular"],
    example: "Эльфийская воительница с сияющими крыльями в древнем лесу",
    style: "epic fantasy character art, intricate costume, magical glow, cinematic lighting, highly detailed",
    coverPrompt: `An elegant elven heroine with luminous iridescent wings standing in an ancient glowing forest, intricate armor, epic fantasy character art, cinematic light, ${NO_TEXT}`,
    fallback: cover("char-fantasy"), keywords: "фэнтези эльф маг воин fantasy",
  },
  {
    id: "char-cinematic", tab: "characters", title: "Кинокадр", subtitle: "Герой как в фильме", icon: "clapper",
    categories: ["popular"],
    example: "Детектив в плаще на ночной улице под дождём, неоновые вывески",
    style: "cinematic film still, anamorphic lens, moody color grading, dramatic lighting, 35mm film",
    coverPrompt: `A cinematic film still of a detective in a trench coat on a rainy night street, neon glow, anamorphic lens, moody color grading, photorealistic, ${NO_TEXT}`,
    fallback: cover("char-cinematic"), keywords: "кино фильм герой кадр cinematic",
  },
  {
    id: "char-cartoon", tab: "characters", title: "3D-мультперсонаж", subtitle: "Как в анимационном кино", icon: "smile",
    categories: ["popular"],
    example: "Милый ёжик-король на троне в стиле 3D-мультфильма",
    style: "3D animated film character, soft subsurface shading, expressive eyes, stylized proportions, studio lighting",
    coverPrompt: `A cute hedgehog king wearing a golden crown sitting on an ornate throne, 3D animated film character, soft lighting, expressive eyes, ${NO_TEXT}`,
    fallback: cover("char-cartoon"), keywords: "мультфильм 3d пиксар персонаж cartoon",
  },
  {
    id: "char-fairy", tab: "characters", title: "Сказочные существа", subtitle: "Волшебники, феи и духи", icon: "cat",
    categories: ["popular"],
    example: "Кот-волшебник в белой мантии колдует светящимися лентами",
    style: "whimsical fairy tale illustration, magical particles, glowing spells, rich detail, cinematic depth",
    coverPrompt: `A ginger cat wizard in a white robe casting glowing blue magical ribbons in a lantern-lit alley, whimsical fairy tale art, cinematic depth, ${NO_TEXT}`,
    fallback: cover("char-fairy"), keywords: "сказка волшебник фея кот magic",
  },
  {
    id: "char-adventure", tab: "characters", title: "Искатели приключений", subtitle: "Пираты, путешественники, герои", icon: "compass",
    categories: ["popular"],
    example: "Леопард-пират в треуголке на палубе старинного корабля",
    style: "adventure concept art, rich textures, dramatic natural light, storytelling composition",
    coverPrompt: `A leopard pirate captain wearing a tricorn hat standing on the deck of an old wooden ship, stormy sea behind, adventure concept art, dramatic light, ${NO_TEXT}`,
    fallback: cover("char-adventure"), keywords: "пират приключения путешественник adventure",
  },
  {
    id: "char-realistic", tab: "characters", title: "Реалистичный портрет", subtitle: "Живые лица и эмоции", icon: "user",
    categories: ["popular"],
    example: "Пожилой рыбак с седой бородой и добрым взглядом, мягкий свет из окна",
    style: "photorealistic character portrait, natural window light, detailed skin texture, emotional expression",
    coverPrompt: `A photorealistic portrait of an old fisherman with a white beard and kind eyes, flat cap, soft window light, detailed skin texture, ${NO_TEXT}`,
    fallback: cover("char-realistic"), keywords: "портрет реализм лицо человек realistic",
  },
  {
    id: "char-creatures", tab: "characters", title: "Монстры и пришельцы", subtitle: "Невиданные создания", icon: "ghost",
    categories: ["popular"],
    example: "Светящийся космический осьминог читает газету",
    style: "surreal creature design, bioluminescent colors, highly detailed skin, cinematic sci-fi lighting",
    coverPrompt: `A glowing cosmic octopus creature with bioluminescent tentacles floating in space, surreal creature design, vivid colors, cinematic lighting, ${NO_TEXT}`,
    fallback: cover("char-creatures"), keywords: "монстр пришелец существо alien creature",
  },
  {
    id: "char-mascot", tab: "characters", title: "Маскоты брендов", subtitle: "Милые персонажи для бизнеса", icon: "heart",
    categories: ["popular"],
    example: "Пушистый белый кролик-маскот среди весенних цветов",
    style: "adorable brand mascot, soft 3D render, friendly expression, clean colorful background",
    coverPrompt: `An adorable fluffy white bunny mascot among spring flowers and pastel eggs, soft 3D render, friendly expression, ${NO_TEXT}`,
    fallback: cover("char-mascot"), keywords: "маскот бренд милый персонаж mascot",
  },
]

/** Ideas for the edit tab: each fills the prompt with a precise instruction. */
export const IMAGE_EDIT_PRESETS: Array<{ id: string; label: string; prompt: string }> = [
  { id: "background", label: "Сменить фон", prompt: "Замени фон на светлую минималистичную студию, объект оставь без изменений" },
  { id: "studio", label: "Студийный свет", prompt: "Сделай профессиональный студийный свет с мягкими тенями, композицию не меняй" },
  { id: "night", label: "Ночная сцена", prompt: "Преврати сцену в ночную: тёплые огни, синие сумерки, всё остальное сохрани" },
  { id: "remove", label: "Убрать лишнее", prompt: "Убери посторонние предметы с фона, главный объект не трогай" },
  { id: "anime", label: "В стиле аниме", prompt: "Перерисуй фото в стиле аниме, сохрани позу, композицию и цвета" },
  { id: "season", label: "Сделать зиму", prompt: "Добавь снег и зимнее настроение, остальное оставь как есть" },
]

export const IMAGE_STYLE_PRESETS: Array<{ id: string; label: string; style: string }> = [
  { id: "none", label: "Без стиля", style: "" },
  { id: "photo", label: "Фотореализм", style: "photorealistic, natural light, true-to-life detail" },
  { id: "cinema", label: "Кино", style: "cinematic film still, dramatic lighting, anamorphic look" },
  { id: "anime", label: "Аниме", style: "high quality anime illustration, clean line art, vivid colors" },
  { id: "render", label: "3D-рендер", style: "premium 3D render, soft global illumination, clean materials" },
  { id: "watercolor", label: "Акварель", style: "delicate watercolor painting, paper texture, soft washes" },
  { id: "neon", label: "Неон", style: "neon cyberpunk lighting, glowing accents, dark moody background" },
  { id: "minimal", label: "Минимализм", style: "minimalist composition, negative space, muted palette" },
]

export function findImageTemplate(id: string | null | undefined) {
  return IMAGE_TEMPLATES.find((template) => template.id === id) || null
}

/** Templates of one tab, filtered by category chip and search words. */
export function filterImageTemplates(
  tab: Exclude<ImageStudioTab, "edit">,
  category: ImageTemplateCategory | "all",
  query = "",
) {
  const words = query.toLowerCase().replace(/ё/g, "е").split(/\s+/).filter(Boolean)
  const inTab = IMAGE_TEMPLATES.filter((template) => template.tab === tab)
  if (words.length) {
    return inTab.filter((template) => {
      const haystack = `${template.title} ${template.subtitle} ${template.keywords}`.toLowerCase().replace(/ё/g, "е")
      return words.every((word) => haystack.includes(word))
    })
  }
  if (tab === "characters" || category === "all") return inTab
  return inTab.filter((template) => template.categories.includes(category))
}

/** The request sent to the image route: what the user wrote plus the chosen looks. */
export function composeImagePrompt(prompt: string, styles: Array<string | undefined>) {
  const clean = prompt.trim()
  const look = styles.map((style) => (style || "").trim()).filter(Boolean).join(", ")
  return look ? `${clean}\n\nVisual style: ${look}` : clean
}
