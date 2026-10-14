/** Words of the Work Code Studio in Russian, English, Kazakh and Arabic. */

export type StudioLanguage = "ru" | "en" | "kk" | "ar"
type Four = readonly [string, string, string, string]
const INDEX: Record<StudioLanguage, number> = { ru: 0, en: 1, kk: 2, ar: 3 }

const WORDS = {
  title: ["Код и превью", "Code & preview", "Код және алдын ала қарау", "الكود والمعاينة"],
  subtitle: ["Загрузите проект или откройте созданный: Malik Work проверит код, запустит превью и выгрузит ZIP.", "Upload a project or open a generated one: Malik Work checks the code, runs the preview and exports a ZIP.", "Жобаны жүктеңіз немесе жасалғанын ашыңыз: Malik Work кодты тексеріп, превьюді іске қосады және ZIP береді.", "ارفع مشروعًا أو افتح مشروعًا مُنشأً: يفحص Malik Work الكود ويشغّل المعاينة ويصدّر ZIP."],
  drop: ["Перетащите папку, файлы или ZIP сюда", "Drop a folder, files or a ZIP here", "Буманы, файлдарды немесе ZIP-ті осында сүйреңіз", "اسحب مجلدًا أو ملفات أو ZIP إلى هنا"],
  pickFolder: ["Выбрать папку", "Choose folder", "Буманы таңдау", "اختيار مجلد"],
  pickFiles: ["Выбрать файлы", "Choose files", "Файлдарды таңдау", "اختيار ملفات"],
  pickZip: ["Загрузить ZIP", "Upload ZIP", "ZIP жүктеу", "رفع ZIP"],
  limits: ["До 400 текстовых файлов и 8 МБ кода; ZIP до 20 МБ. node_modules, .git и файлы с секретами (.env) не загружаются.", "Up to 400 text files and 8 MB of code; ZIP up to 20 MB. node_modules, .git and secret files (.env) are never uploaded.", "400 мәтіндік файлға және 8 МБ кодқа дейін; ZIP 20 МБ-қа дейін. node_modules, .git және құпия файлдар (.env) жүктелмейді.", "حتى 400 ملف نصي و8 ميغابايت من الكود؛ ZIP حتى 20 ميغابايت. لا تُرفع node_modules و.git وملفات الأسرار (.env)."],
  reading: ["Читаю файлы…", "Reading files…", "Файлдарды оқып жатырмын…", "جارٍ قراءة الملفات…"],
  checking: ["Проверяю код и собираю превью…", "Checking the code and building the preview…", "Кодты тексеріп, превью жинап жатырмын…", "جارٍ فحص الكود وبناء المعاينة…"],
  preview: ["Превью", "Preview", "Превью", "المعاينة"],
  code: ["Код", "Code", "Код", "الكود"],
  problems: ["Проблемы", "Problems", "Мәселелер", "المشكلات"],
  desktop: ["Компьютер", "Desktop", "Компьютер", "سطح المكتب"],
  mobile: ["Телефон", "Mobile", "Телефон", "الهاتف"],
  refresh: ["Обновить", "Refresh", "Жаңарту", "تحديث"],
  exportZip: ["Скачать ZIP", "Download ZIP", "ZIP жүктеп алу", "تنزيل ZIP"],
  save: ["Сохранить в проекты", "Save to projects", "Жобаларға сақтау", "حفظ في المشاريع"],
  saved: ["Сохранено: {n} из {m} файлов", "Saved: {n} of {m} files", "Сақталды: {m} файлдың {n}", "تم الحفظ: {n} من {m} ملف"],
  open: ["Открыть сохранённый", "Open saved", "Сақталғанды ашу", "فتح المحفوظ"],
  fix: ["Исправить с AI", "Fix with AI", "AI арқылы түзету", "إصلاح بالذكاء الاصطناعي"],
  newProject: ["Другой проект", "Another project", "Басқа жоба", "مشروع آخر"],
  close: ["Закрыть", "Close", "Жабу", "إغلاق"],
  files: ["файлов", "files", "файл", "ملفات"],
  noPreview: ["Превью недоступно: {reason}", "No preview: {reason}", "Превью жоқ: {reason}", "لا توجد معاينة: {reason}"],
  noProblems: ["Ошибок не найдено.", "No problems found.", "Қате табылмады.", "لم يتم العثور على مشكلات."],
  runtime: ["При запуске", "At runtime", "Іске қосқанда", "أثناء التشغيل"],
  limitations: ["Ограничения превью", "Preview limitations", "Превью шектеулері", "قيود المعاينة"],
  skipped: ["Не загружены", "Not uploaded", "Жүктелмеді", "لم تُرفع"],
  checks: ["Что проверено", "What was checked", "Не тексерілді", "ما تم فحصه"],
  route: ["Страница", "Page", "Бет", "الصفحة"],
  home: ["На главную", "Home", "Басты бетке", "الرئيسية"],
  stack: ["Стек", "Stack", "Стек", "التقنية"],
  selectFile: ["Выберите файл слева", "Choose a file on the left", "Сол жақтан файлды таңдаңыз", "اختر ملفًا من اليسار"],
  "status.COMPLETED_VERIFIED": ["Готово — проверено", "Completed — verified", "Дайын — тексерілді", "مكتمل — تم التحقق"],
  "status.COMPLETED_WITH_LIMITATIONS": ["Готово — с ограничениями", "Completed — with limitations", "Дайын — шектеулермен", "مكتمل — مع قيود"],
  "status.FAILED": ["Найдены ошибки", "Failed checks", "Қателер табылды", "فشل الفحص"],
  "status.BLOCKED": ["Заблокировано", "Blocked", "Бұғатталған", "محظور"],
  "status.CANCELLED": ["Отменено", "Cancelled", "Тоқтатылды", "أُلغي"],
  "status.CHECKING": ["Проверяю превью…", "Checking the preview…", "Превьюді тексеріп жатырмын…", "جارٍ فحص المعاينة…"],
  "reason.NEXT_PAGES_ROUTER_UNSUPPORTED": ["Next.js Pages Router пока не запускается в превью", "Next.js Pages Router is not supported in the preview yet", "Next.js Pages Router әзірге превьюде іске қосылмайды", "موجّه صفحات Next.js غير مدعوم بعد في المعاينة"],
  "reason.SERVER_ONLY_PROJECT": ["серверному проекту нужен запуск на сервере", "a server project needs to run on a server", "серверлік жобаны серверде іске қосу керек", "يحتاج المشروع الخادمي إلى تشغيل على خادم"],
  "reason.NO_ENTRY": ["не найдена точка входа (index.html, app/page или src/main)", "no entry point found (index.html, app/page or src/main)", "кіру нүктесі табылмады", "لم يُعثر على نقطة دخول"],
  "reason.NEEDS_BUNDLER": ["index.html подключает TypeScript-модуль без src/main", "index.html loads a TypeScript module without src/main", "index.html TypeScript модулін src/main-сіз қосады", "يحمّل index.html وحدة TypeScript بدون src/main"],
  "reason.PREVIEW_TOO_LARGE": ["проект слишком большой для превью", "the project is too large for the preview", "жоба превью үшін тым үлкен", "المشروع أكبر من أن يُعاين"],
  "skip.UNSAFE_PATH": ["небезопасный путь", "unsafe path", "қауіпті жол", "مسار غير آمن"],
  "skip.SECRET_FILE": ["файл с секретами", "secret file", "құпия файл", "ملف أسرار"],
  "skip.BINARY_OR_UNSUPPORTED": ["бинарный или неподдерживаемый", "binary or unsupported", "бинарлық немесе қолдау жоқ", "ثنائي أو غير مدعوم"],
  "skip.TOO_LARGE": ["слишком большой", "too large", "тым үлкен", "كبير جدًا"],
  "skip.IGNORED_DIRECTORY": ["служебная папка", "generated folder", "қызметтік бума", "مجلد مُولّد"],
  "skip.LIMIT_FILES": ["превышен лимит файлов", "file limit reached", "файл шегі асты", "تم بلوغ حد الملفات"],
  "skip.LIMIT_TOTAL": ["превышен общий объём", "total size limit reached", "жалпы көлем шегі асты", "تم بلوغ حد الحجم"],
  "skip.DUPLICATE": ["повтор", "duplicate", "қайталау", "مكرر"],
  signIn: ["Войдите в аккаунт, чтобы сохранить проект.", "Sign in to save the project.", "Жобаны сақтау үшін аккаунтқа кіріңіз.", "سجّل الدخول لحفظ المشروع."],
  timeout: ["Превью не ответило за 8 секунд.", "The preview did not respond within 8 seconds.", "Превью 8 секундта жауап бермеді.", "لم تستجب المعاينة خلال 8 ثوانٍ."],
} as const satisfies Record<string, Four>

export type StudioWord = keyof typeof WORDS

export function studioLanguage(): StudioLanguage {
  if (typeof document === "undefined") return "ru"
  const value = (document.documentElement.lang || navigator.language || "ru").toLowerCase()
  return value.startsWith("ar") ? "ar" : value.startsWith("kk") ? "kk" : value.startsWith("en") ? "en" : "ru"
}

export function studioWord(language: StudioLanguage, key: StudioWord, values: Record<string, string | number> = {}) {
  const text = (WORDS[key] as Four)[INDEX[language]]
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => name in values ? String(values[name]) : whole)
}

export function studioReason(language: StudioLanguage, code: string | null) {
  const key = `reason.${code}` as StudioWord
  return key in WORDS ? studioWord(language, key) : String(code || "—")
}

export function studioSkip(language: StudioLanguage, code: string) {
  const key = `skip.${code}` as StudioWord
  return key in WORDS ? studioWord(language, key) : code
}
