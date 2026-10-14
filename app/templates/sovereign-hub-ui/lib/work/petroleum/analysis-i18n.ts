import type { OilLanguage, OilWellAnalysis, PetroleumAnalysisResult } from "./analysis-contract"

/**
 * Words of the oil report in Russian, English, Kazakh and Arabic.
 *
 * Only words: every number comes from the analysis and is formatted here, so
 * a translation can never change a value, a unit or a formula.
 */

type Four = readonly [ru: string, en: string, kk: string, ar: string]
const INDEX: Record<OilLanguage, number> = { ru: 0, en: 1, kk: 2, ar: 3 }

const WORDS = {
  brand: ["MALIK OIL AI", "MALIK OIL AI", "MALIK OIL AI", "MALIK OIL AI"],
  product: ["Аналитика добычи нефти", "Petroleum Production Intelligence", "Мұнай өндірісінің талдауы", "تحليل إنتاج النفط"],
  title: ["Инженерный отчёт по добыче", "Production engineering report", "Өндіріс бойынша инженерлік есеп", "تقرير هندسي عن الإنتاج"],
  fieldTitle: ["Месторождение: сумма {n} скважин", "Field: sum of {n} wells", "Кен орны: {n} ұңғыманың қосындысы", "الحقل: مجموع {n} آبار"],
  field: ["Месторождение", "Field", "Кен орны", "الحقل"],
  crossPassed: ["Расчёты сверены двумя независимыми модулями", "Cross-checked by two independent engines", "Есептеулер екі тәуелсіз модульмен салыстырылды", "تمت مطابقة الحسابات بمحركين مستقلين"],
  crossSkipped: ["Детерминированный расчёт движка", "Deterministic engine calculation", "Қозғалтқыштың детерминирленген есебі", "حساب حتمي من المحرك"],
  crossFailed: ["Модули разошлись — нужна проверка инженера", "Engines disagree — engineer review required", "Модульдер сәйкес келмеді — инженер тексеруі қажет", "اختلف المحركان — يلزم تحقق مهندس"],
  tampered: ["Числа в сохранённом ответе отличались — показан пересчёт движка", "Stored numbers differed — showing the engine's recalculation", "Сақталған жауаптағы сандар өзгеше — қозғалтқыштың қайта есебі көрсетілді", "اختلفت الأرقام المحفوظة — تُعرض إعادة حساب المحرك"],
  synthetic: ["Синтетические данные", "Synthetic data", "Синтетикалық деректер", "بيانات اصطناعية"],
  userData: ["Данные пользователя, не верифицированы", "User data, unverified", "Пайдаланушы деректері, тексерілмеген", "بيانات المستخدم، غير موثقة"],
  engineerReview: ["Требуется проверка уполномоченного инженера", "Authorised engineer review required", "Уәкілетті инженердің тексеруі қажет", "تلزم مراجعة مهندس مخوّل"],
  conclusion: ["Инженерный вывод", "Engineering conclusion", "Инженерлік қорытынды", "الاستنتاج الهندسي"],
  kpis: ["Ключевые показатели", "Key indicators", "Негізгі көрсеткіштер", "المؤشرات الرئيسية"],
  wells: ["Скважины", "Wells", "Ұңғымалар", "الآبار"],
  // Sections
  "s.rates": ["Дебиты нефти, воды и жидкости", "Oil, water and liquid rates", "Мұнай, су және сұйықтық дебиттері", "معدلات النفط والماء والسوائل"],
  "s.water-cut": ["Обводнённость", "Water cut", "Сулану", "نسبة الماء"],
  "s.gor": ["Газовый фактор (GOR)", "Gas–oil ratio (GOR)", "Газ факторы (GOR)", "نسبة الغاز إلى النفط (GOR)"],
  "s.forecast": ["Факт и сценарии тренда", "Actual and trend scenarios", "Нақты деректер және тренд сценарийлері", "الفعلي وسيناريوهات الاتجاه"],
  "s.table": ["Данные по периодам", "Data by period", "Кезеңдер бойынша деректер", "البيانات حسب الفترة"],
  "s.wor": ["Водонефтяной фактор (WOR)", "Water–oil ratio (WOR)", "Су-мұнай факторы (WOR)", "نسبة الماء إلى النفط (WOR)"],
  "s.liquid": ["Стабильность дебита жидкости", "Liquid rate stability", "Сұйықтық дебитінің тұрақтылығы", "ثبات معدل السوائل"],
  "s.oil-decline": ["Темп падения нефти", "Oil decline rate", "Мұнай дебитінің құлау қарқыны", "معدل انخفاض النفط"],
  "s.decline-models": ["Сравнение моделей падения", "Decline model comparison", "Құлау модельдерін салыстыру", "مقارنة نماذج الانخفاض"],
  "s.period-changes": ["Изменения между периодами", "Period-over-period changes", "Кезеңдер арасындағы өзгерістер", "التغيرات بين الفترات"],
  "s.anomalies": ["Аномалии", "Anomalies", "Аномалиялар", "الشذوذات"],
  "s.data-quality": ["Качество данных", "Data quality", "Деректер сапасы", "جودة البيانات"],
  "s.cumulative": ["Накопленная добыча", "Cumulative production", "Жинақталған өндіру", "الإنتاج التراكمي"],
  "s.gas": ["Газ", "Gas", "Газ", "الغاز"],
  "s.water-oil-balance": ["Баланс нефть — вода", "Oil–water balance", "Мұнай — су балансы", "توازن النفط والماء"],
  "s.hypotheses": ["Гипотезы и необходимые замеры", "Hypotheses and required measurements", "Гипотезалар және қажетті өлшеулер", "الفرضيات والقياسات المطلوبة"],
  "s.multiwell": ["Сравнение скважин", "Well comparison", "Ұңғымаларды салыстыру", "مقارنة الآبار"],
  "s.economics": ["Экономический эффект", "Economic effect", "Экономикалық әсер", "الأثر الاقتصادي"],
  "s.chan": ["Диагностика Chan по WOR", "Chan WOR diagnostic", "WOR бойынша Chan диагностикасы", "تشخيص Chan لنسبة الماء إلى النفط"],
  "s.formulas": ["Формулы и подстановка", "Formulas with values", "Формулалар және мәндер", "المعادلات مع القيم"],
  "s.limitations": ["Ограничения и происхождение расчёта", "Limitations and provenance", "Шектеулер және есептің шығу тегі", "القيود ومصدر الحساب"],
  // Series and columns
  oil: ["Нефть", "Oil", "Мұнай", "النفط"],
  water: ["Вода", "Water", "Су", "الماء"],
  liquid: ["Жидкость", "Liquid", "Сұйықтық", "السوائل"],
  gas: ["Газ", "Gas", "Газ", "الغاز"],
  wc: ["Обводнённость", "Water cut", "Сулану", "نسبة الماء"],
  wcMass: ["Обводнённость (по массе)", "Water cut (by mass)", "Сулану (массасы бойынша)", "نسبة الماء (بالكتلة)"],
  gor: ["GOR", "GOR", "GOR", "GOR"],
  wor: ["WOR", "WOR", "WOR", "WOR"],
  worDerivative: ["WOR′ за период", "WOR′ per period", "Кезеңдегі WOR′", "WOR′ لكل فترة"],
  linear: ["Линейный тренд", "Linear trend", "Сызықтық тренд", "اتجاه خطي"],
  exponential: ["Экспоненциальная (Arps b = 0)", "Exponential (Arps b = 0)", "Экспоненциалды (Arps b = 0)", "أسي (Arps b = 0)"],
  harmonic: ["Гармоническая (Arps b = 1)", "Harmonic (Arps b = 1)", "Гармоникалық (Arps b = 1)", "توافقي (Arps b = 1)"],
  hyperbolic: ["Гиперболическая (0 ≤ b ≤ 1)", "Hyperbolic (0 ≤ b ≤ 1)", "Гиперболалық (0 ≤ b ≤ 1)", "زائدي (0 ≤ b ≤ 1)"],
  linearShort: ["Линейная", "Linear", "Сызықтық", "خطي"],
  exponentialShort: ["Экспонента b=0", "Exponential b=0", "Экспонента b=0", "أسي b=0"],
  harmonicShort: ["Гармоническая b=1", "Harmonic b=1", "Гармоникалық b=1", "توافقي b=1"],
  hyperbolicShort: ["Гиперболическая", "Hyperbolic", "Гиперболалық", "زائدي"],
  forecastChart: ["Нефть: факт и модели тренда", "Oil: actual and trend models", "Мұнай: нақты және тренд модельдері", "النفط: الفعلي ونماذج الاتجاه"],
  expandAll: ["Развернуть все разделы", "Expand all sections", "Барлық бөлімдерді ашу", "توسيع كل الأقسام"],
  collapseAll: ["Свернуть разделы", "Collapse sections", "Бөлімдерді жию", "طي الأقسام"],
  unitsCaption: ["Единицы: {unit}", "Units: {unit}", "Бірліктер: {unit}", "الوحدات: {unit}"],
  period: ["Период", "Period", "Кезең", "الفترة"],
  well: ["Скважина", "Well", "Ұңғыма", "البئر"],
  model: ["Модель", "Model", "Модель", "النموذج"],
  parameters: ["Параметры", "Parameters", "Параметрлер", "المعاملات"],
  best: ["Лучшее совпадение с историей", "Best fit to history", "Тарихпен ең жақсы сәйкестік", "أفضل مطابقة للتاريخ"],
  notValid: ["не применима", "not applicable", "қолданылмайды", "غير منطبق"],
  actual: ["Факт", "Actual", "Нақты", "فعلي"],
  forecastZone: ["Сценарии", "Scenarios", "Сценарийлер", "سيناريوهات"],
  share: ["Доля в падении", "Share of loss", "Құлаудағы үлесі", "الحصة من الانخفاض"],
  loss: ["Потеря нефти", "Oil loss", "Мұнай шығыны", "فقد النفط"],
  value: ["Значение", "Value", "Мәні", "القيمة"],
  // KPI
  "k.oil": ["Дебит нефти", "Oil rate", "Мұнай дебиті", "معدل النفط"],
  "k.wc": ["Обводнённость", "Water cut", "Сулану", "نسبة الماء"],
  "k.gor": ["GOR, последний период", "GOR, last period", "GOR, соңғы кезең", "GOR، آخر فترة"],
  "k.liquid": ["Дебит жидкости", "Liquid rate", "Сұйықтық дебиті", "معدل السوائل"],
  "k.wor": ["WOR, последний период", "WOR, last period", "WOR, соңғы кезең", "WOR، آخر فترة"],
  "k.gas": ["Дебит газа", "Gas rate", "Газ дебиті", "معدل الغاز"],
  "k.decline": ["Средний темп падения", "Average decline", "Орташа құлау қарқыны", "متوسط الانخفاض"],
  "k.stable": ["стабилен, CV {cv} %", "stable, CV {cv} %", "тұрақты, CV {cv} %", "ثابت، CV {cv} %"],
  "k.varies": ["CV {cv} %", "CV {cv} %", "CV {cv} %", "CV {cv} %"],
  perPeriod: ["за период", "per period", "кезеңге", "لكل فترة"],
  perMonth: ["в месяц", "per month", "айына", "شهريًا"],
  perDayWord: ["в сутки", "per day", "тәулігіне", "يوميًا"],
  perYear: ["в год (эффективный)", "per year (effective)", "жылына (тиімді)", "سنويًا (فعلي)"],
  pp: ["п.п.", "pp", "п.т.", "نقطة مئوية"],
  // Buttons
  downloadCsv: ["Скачать CSV", "Download CSV", "CSV жүктеу", "تنزيل CSV"],
  copyTable: ["Копировать таблицу", "Copy table", "Кестені көшіру", "نسخ الجدول"],
  copied: ["Скопировано", "Copied", "Көшірілді", "تم النسخ"],
  showRows: ["Показать все строки ({n})", "Show all rows ({n})", "Барлық жолдарды көрсету ({n})", "عرض كل الصفوف ({n})"],
  hideRows: ["Свернуть таблицу", "Collapse table", "Кестені жию", "طي الجدول"],
  toggleSeries: ["Показать или скрыть: {name}", "Show or hide: {name}", "Көрсету не жасыру: {name}", "إظهار أو إخفاء: {name}"],
  chartTable: ["Значения графика", "Chart values", "График мәндері", "قيم الرسم"],
  // Notes
  forecastCaveat: ["Это продолжение тренда истории, а не прогноз пласта: модели не учитывают давление, ГТМ, ограничения оборудования и смену режима. Три сценария — не доверительный интервал.", "This continues the historical trend; it is not a reservoir forecast. The models ignore pressure, interventions, equipment limits and regime changes. The three scenarios are not a confidence interval.", "Бұл тарихи трендтің жалғасы, қабат болжамы емес: модельдер қысымды, ұңғыма шараларын, жабдық шектеулерін және режим өзгерісін ескермейді. Үш сценарий сенімділік аралығы емес.", "هذا امتداد للاتجاه التاريخي وليس توقعًا للمكمن: لا تراعي النماذج الضغط أو التدخلات أو حدود المعدات أو تغيّر النظام. السيناريوهات الثلاثة ليست فاصل ثقة."],
  linearZero: ["Линейный тренд достигает нуля в {period} — физически падение замедлится; значения ниже нуля не показываются.", "The linear trend reaches zero in {period}; physically the decline would slow down, so values below zero are not shown.", "Сызықтық тренд {period} нөлге жетеді — физикалық тұрғыда құлау баяулайды; нөлден төмен мәндер көрсетілмейді.", "يبلغ الاتجاه الخطي الصفر في {period}؛ فيزيائيًا يتباطأ الانخفاض، لذا لا تُعرض القيم السالبة."],
  forecastBlocked: ["Сценарии не построены: {reason}", "No scenarios: {reason}", "Сценарийлер құрылмады: {reason}", "لم تُبنَ سيناريوهات: {reason}"],
  cumulativeNote: ["Дебиты приняты средними за период и умножены на календарные дни.", "Rates are taken as period averages and multiplied by calendar days.", "Дебиттер кезеңнің орташасы ретінде алынып, күнтізбелік күндерге көбейтілді.", "اعتُبرت المعدلات متوسطات للفترة وضُربت في أيام التقويم."],
  economicsNote: ["Валовая выручка до налогов при постоянной цене {price}; без OPEX, роялти, налогов и дисконтирования.", "Gross pre-tax revenue at a constant price of {price}; no OPEX, royalty, tax or discounting.", "Тұрақты {price} бағасындағы салыққа дейінгі жалпы түсім; OPEX, роялти, салық және дисконттау есепке алынбаған.", "إيراد إجمالي قبل الضرائب بسعر ثابت {price}؛ دون تكاليف تشغيل أو إتاوات أو ضرائب أو خصم."],
  dailyGap: ["Разница выручки: первый и последний дебит", "Revenue gap: first vs last rate", "Түсім айырмасы: бірінші және соңғы дебит", "فرق الإيراد: المعدل الأول مقابل الأخير"],
  monthGap: ["То же за 30,44 суток", "Same over 30.44 days", "30,44 тәулікке дәл солай", "نفسه خلال 30.44 يومًا"],
  historicalGap: ["Недобор относительно первого дебита за историю", "Shortfall against the first rate over the history", "Тарих бойы бірінші дебитке қатысты кем түсім", "النقص مقارنة بالمعدل الأول خلال الفترة"],
  forecastRevenue: ["Выручка в сценариях на горизонте", "Revenue in the scenarios over the horizon", "Болжам көкжиегіндегі сценарийлер түсімі", "الإيراد في السيناريوهات خلال الأفق"],
  chanNote: ["Скрининг по Chan (1995): форма кривой WOR подсказывает, где искать причину, но не доказывает механизм; для надёжного вывода нужна длинная история и замеры.", "Chan (1995) screening: the WOR curve shape suggests where to look but does not prove the mechanism; a long history and measurements are needed.", "Chan (1995) скринингі: WOR қисығының пішіні себепті қай жерден іздеу керегін көрсетеді, бірақ механизмді дәлелдемейді; ұзақ тарих пен өлшеулер қажет.", "فحص Chan ‏(1995): يشير شكل منحنى WOR إلى مكان البحث لكنه لا يثبت الآلية؛ يلزم تاريخ طويل وقياسات."],
  chanSlope: ["Наклон log WOR — log t: {slope}; производная WOR′ {trend}.", "log WOR vs log t slope: {slope}; WOR′ is {trend}.", "log WOR — log t көлбеуі: {slope}; WOR′ {trend}.", "ميل log WOR مقابل log t: ‏{slope}؛ ‏WOR′ {trend}."],
  rising: ["растёт", "rising", "өсуде", "يرتفع"],
  falling: ["снижается", "falling", "төмендеуде", "ينخفض"],
  flat: ["постоянна", "flat", "тұрақты", "ثابت"],
  hypothesesIntro: ["Это гипотезы для проверки, а не диагноз: по дебитам механизм не определяется.", "These are hypotheses to test, not a diagnosis: rates alone do not determine the mechanism.", "Бұл диагноз емес, тексеруге арналған гипотезалар: механизм тек дебиттер бойынша анықталмайды.", "هذه فرضيات للاختبار وليست تشخيصًا: لا تحدد المعدلات وحدها الآلية."],
  measurements: ["Что измерить", "What to measure", "Нені өлшеу керек", "ما يجب قياسه"],
  hWater: ["Рост воды", "Rising water", "Судың өсуі", "ارتفاع الماء"],
  hGas: ["Рост GOR", "Rising GOR", "GOR өсуі", "ارتفاع GOR"],
  hProductivity: ["Падение жидкости и нефти", "Falling liquid and oil", "Сұйықтық пен мұнайдың азаюы", "انخفاض السوائل والنفط"],
  noAnomalies: ["Скачков ≥ 30 %, пропусков периодов и выбросов не найдено.", "No jumps ≥ 30 %, missing periods or outliers found.", "≥ 30 % секірулер, өткізілген кезеңдер және шығарындылар табылмады.", "لم توجد قفزات ≥ 30 % أو فترات مفقودة أو قيم شاذة."],
  provenance: ["Движок {engine} · схема {schema} · ID {id}", "Engine {engine} · schema {schema} · ID {id}", "Қозғалтқыш {engine} · схема {schema} · ID {id}", "المحرك {engine} · المخطط {schema} · المعرّف {id}"],
  sourceHash: ["SHA-256 исходной таблицы: {hash}", "Source table SHA-256: {hash}", "Бастапқы кестенің SHA-256: {hash}", "SHA-256 للجدول المصدر: {hash}"],
  crossDetail: ["Сверка с модулем {engine}: {n} значений совпали.", "Cross-check with {engine}: {n} values agree.", "{engine} модулімен салыстыру: {n} мән сәйкес келді.", "المطابقة مع {engine}: تطابقت {n} قيمة."],
  crossMismatch: ["Сверка с модулем {engine}: расхождение в {list}.", "Cross-check with {engine}: mismatch in {list}.", "{engine} модулімен салыстыру: {list} бойынша айырма.", "المطابقة مع {engine}: اختلاف في {list}."],
  crossNone: ["Независимая сверка не выполнялась: {reason}.", "No independent cross-check: {reason}.", "Тәуелсіз салыстыру орындалмады: {reason}.", "لم تُجرَ مطابقة مستقلة: {reason}."],
  rowsAccepted: ["Принято строк: {a}, отклонено: {r}.", "Rows accepted: {a}, rejected: {r}.", "Қабылданған жолдар: {a}, қабылданбағаны: {r}.", "صفوف مقبولة: {a}، مرفوضة: {r}."],
  unitsLine: ["Единицы: жидкости {liquid}{gas}.", "Units: liquids {liquid}{gas}.", "Бірліктер: сұйықтар {liquid}{gas}.", "الوحدات: السوائل {liquid}{gas}."],
  gasUnitPart: ["; газ {gas}, GOR {gor}", "; gas {gas}, GOR {gor}", "; газ {gas}, GOR {gor}", "؛ الغاز {gas}، GOR ‏{gor}"],
  needsTitle: ["Malik Oil AI · таблица добычи найдена, расчёт не запускался", "Malik Oil AI · production table found; nothing was computed", "Malik Oil AI · өндіру кестесі табылды, есептеу басталмады", "Malik Oil AI · وُجد جدول إنتاج؛ لم يُجرَ أي حساب"],
  needsExample: ["Пример заголовка: `Месяц | Нефть, м3/сут | Вода, м3/сут | Газ, тыс. м3/сут` или `Month,Oil_Rate_bbl_day,Water_Rate_bbl_day,Gas_Rate_scf_day`.", "Header example: `Month | Oil, bbl/day | Water, bbl/day | Gas, Mscf/day` or `Month,Oil_Rate_bbl_day,Water_Rate_bbl_day,Gas_Rate_scf_day`.", "Тақырып үлгісі: `Ай | Мұнай, м3/тәул | Су, м3/тәул | Газ, мың м3/тәул`.", "مثال على العنوان: `الشهر | النفط bbl/day | الماء bbl/day | الغاز Mscf/day`."],
  protocol: ["Протокол расчёта модуля загрузки · {version}", "Upload engine calculation protocol · {version}", "Жүктеу модулінің есептеу хаттамасы · {version}", "بروتوكول حساب محرك الرفع · {version}"],
  wellsOmitted: ["Показаны {n} скважин с наибольшей потерей нефти; ещё {m} в отчёт не вошли.", "Showing the {n} wells with the largest oil loss; {m} more are not included.", "Мұнай шығыны ең көп {n} ұңғыма көрсетілді; тағы {m} кірмеді.", "تُعرض {n} آبار ذات أكبر فقد للنفط؛ لم تُدرج {m} أخرى."],
} as const satisfies Record<string, Four>

/** Codes from the analysis (flags, hypotheses, measurements, reasons, warnings, limitations). */
const CODES: Record<string, Four> = {
  // Section reasons and blocked forecasts
  NO_WATER_DATA: ["нет данных по воде", "no water data", "су деректері жоқ", "لا توجد بيانات للماء"],
  NO_GAS_DATA: ["нет данных по газу", "no gas data", "газ деректері жоқ", "لا توجد بيانات للغاز"],
  TOO_FEW_POINTS: ["слишком мало точек (нужно не меньше 4)", "too few points (at least 4 needed)", "нүктелер тым аз (кемінде 4 қажет)", "نقاط قليلة جدًا (يلزم 4 على الأقل)"],
  NO_DECLINING_TREND: ["нет устойчивого падения нефти", "no steady oil decline", "мұнайдың тұрақты құлауы жоқ", "لا يوجد انخفاض مستقر للنفط"],
  ZERO_RATES: ["в истории есть нулевые дебиты", "the history has zero rates", "тарихта нөлдік дебиттер бар", "يتضمن التاريخ معدلات صفرية"],
  NO_HORIZON: ["горизонт прогноза 0", "forecast horizon is 0", "болжам көкжиегі 0", "أفق التوقع 0"],
  NO_CALENDAR_PERIODS: ["нужны календарные периоды", "calendar periods are needed", "күнтізбелік кезеңдер қажет", "تلزم فترات تقويمية"],
  NO_TRIGGER: ["заметных изменений воды и газа нет", "no notable water or gas change", "су мен газдың елеулі өзгерісі жоқ", "لا تغير ملحوظ في الماء أو الغاز"],
  SINGLE_WELL: ["одна скважина", "a single well", "бір ұңғыма", "بئر واحدة"],
  NO_PRICE: ["цена нефти не указана — напишите, например, «цена 70 USD/bbl»", "no oil price given — add e.g. “price 70 USD/bbl”", "мұнай бағасы көрсетілмеген — мысалы, «баға 70 USD/bbl» деп жазыңыз", "لم يُذكر سعر النفط — أضف مثلًا «السعر 70 USD/bbl»"],
  PRICE_UNIT_NEEDS_DENSITY: ["для цены в другой единице нужна плотность нефти", "a price in another unit needs the oil density", "басқа бірліктегі баға үшін мұнай тығыздығы қажет", "يتطلب السعر بوحدة أخرى كثافة النفط"],
  NOT_REQUESTED: ["не запрошено", "not requested", "сұралмаған", "غير مطلوب"],
  // Quality flags
  SYNTHETIC_DATA: ["Данные помечены как синтетические.", "Data are marked as synthetic.", "Деректер синтетикалық деп белгіленген.", "البيانات موسومة بأنها اصطناعية."],
  GAS_REFERENCE_NOT_STATED: ["Стандартные условия газа не указаны; GOR дан в базисе источника.", "Gas standard conditions are not stated; GOR is on the source's basis.", "Газдың стандарт жағдайлары көрсетілмеген; GOR дереккөз базисінде.", "لم تُذكر الظروف القياسية للغاز؛ GOR على أساس المصدر."],
  MASS_BASIS: ["Нефть и вода в тоннах: обводнённость рассчитана по массе.", "Oil and water in tonnes: water cut is by mass.", "Мұнай мен су тоннамен: сулану массасы бойынша есептелді.", "النفط والماء بالأطنان: نسبة الماء محسوبة بالكتلة."],
  NO_WATER_COLUMN: ["Нет столбца воды: обводнённость, WOR и баланс не рассчитаны.", "No water column: water cut, WOR and balance are not computed.", "Су бағаны жоқ: сулану, WOR және баланс есептелмеді.", "لا يوجد عمود للماء: لم تُحسب نسبة الماء وWOR والتوازن."],
  NO_GAS_COLUMN: ["Нет столбца газа: GOR не рассчитан.", "No gas column: GOR is not computed.", "Газ бағаны жоқ: GOR есептелмеді.", "لا يوجد عمود للغاز: لم يُحسب GOR."],
  LOW_SAMPLE: ["Меньше 6 точек: модели падения малонадёжны.", "Fewer than 6 points: decline models are weak.", "6 нүктеден аз: құлау модельдері сенімсіз.", "أقل من 6 نقاط: نماذج الانخفاض ضعيفة."],
  WEAK_FIT: ["Лучшая модель описывает историю слабо (R² < 0,8).", "The best model fits the history weakly (R² < 0.8).", "Ең жақсы модель тарихты әлсіз сипаттайды (R² < 0,8).", "أفضل نموذج يطابق التاريخ بضعف (R² < 0.8)."],
  LINEAR_REACHES_ZERO: ["Линейный тренд уходит в ноль на горизонте сценариев.", "The linear trend reaches zero within the scenario horizon.", "Сызықтық тренд сценарий көкжиегінде нөлге жетеді.", "يصل الاتجاه الخطي إلى الصفر ضمن أفق السيناريوهات."],
  ZERO_OIL: ["Нулевой дебит нефти (остановка?) в {period}.", "Zero oil rate (shut-in?) in {period}.", "{period} мұнай дебиті нөл (тоқтау?).", "معدل نفط صفري (إغلاق؟) في {period}."],
  GAP: ["Пропуск периодов перед {period}; значения не интерполировались.", "Missing periods before {period}; nothing was interpolated.", "{period} алдында кезеңдер өткізілген; интерполяция жасалмады.", "فترات مفقودة قبل {period}؛ لم يُجرَ استيفاء."],
  OIL_JUMP: ["Скачок нефти ≥ 30 % в {period}.", "Oil jump ≥ 30 % in {period}.", "{period} мұнай секіруі ≥ 30 %.", "قفزة في النفط ≥ 30 % في {period}."],
  LIQUID_JUMP: ["Скачок жидкости ≥ 30 % в {period}.", "Liquid jump ≥ 30 % in {period}.", "{period} сұйықтық секіруі ≥ 30 %.", "قفزة في السوائل ≥ 30 % في {period}."],
  GOR_JUMP: ["Скачок GOR ≥ 30 % в {period}.", "GOR jump ≥ 30 % in {period}.", "{period} GOR секіруі ≥ 30 %.", "قفزة في GOR ≥ 30 % في {period}."],
  WC_JUMP: ["Скачок обводнённости ≥ 10 п.п. в {period}.", "Water-cut jump ≥ 10 pp in {period}.", "{period} сулану секіруі ≥ 10 п.т.", "قفزة في نسبة الماء ≥ 10 نقاط في {period}."],
  RESIDUAL_OUTLIER: ["Выброс относительно модели в {period} (robust z > 3,5).", "Outlier against the model in {period} (robust z > 3.5).", "{period} модельге қатысты шығарынды (robust z > 3,5).", "قيمة شاذة مقارنة بالنموذج في {period} ‏(robust z > 3.5)."],
  CUMULATIVE_WITH_GAPS: ["Накопленная добыча посчитана только по имеющимся периодам.", "Cumulative production covers only the periods present.", "Жинақталған өндіру тек бар кезеңдер бойынша есептелді.", "يغطي الإنتاج التراكمي الفترات المتوفرة فقط."],
  FIELD_PARTIAL_PERIODS: ["Итог месторождения — только по периодам, где есть все скважины.", "Field totals use only periods reported by every well.", "Кен орны қорытындысы — барлық ұңғымалар бар кезеңдер бойынша ғана.", "إجماليات الحقل للفترات التي أبلغت عنها جميع الآبار فقط."],
  FIELD_NO_SHARED_PERIODS: ["У скважин нет общих периодов — итог месторождения не строится.", "The wells share no periods — no field total.", "Ұңғымалардың ортақ кезеңдері жоқ — кен орны қорытындысы жоқ.", "لا تشترك الآبار في فترات — لا إجمالي للحقل."],
  ROWS_REJECTED: ["Отклонено строк: {row}.", "Rows rejected: {row}.", "Қабылданбаған жолдар: {row}.", "صفوف مرفوضة: {row}."],
  WELLS_OMITTED: ["Не вошли в отчёт скважин: {row}.", "Wells left out of the report: {row}.", "Есепке кірмеген ұңғымалар: {row}.", "آبار لم تُدرج في التقرير: {row}."],
  UNITS_FROM_MESSAGE: ["Единицы столбцов взяты из текста сообщения.", "Column units were taken from the message text.", "Баған бірліктері хабарлама мәтінінен алынды.", "أُخذت وحدات الأعمدة من نص الرسالة."],
  OIL_MASS_TO_VOLUME_BY_DENSITY: ["Нефть переведена из тонн в объём по указанной плотности.", "Oil was converted from tonnes to volume using the stated density.", "Мұнай көрсетілген тығыздық бойынша тоннадан көлемге ауыстырылды.", "حُوّل النفط من أطنان إلى حجم بالكثافة المذكورة."],
  WATER_CONVERTED_TO_OIL_UNIT: ["Вода переведена в единицу нефти (точный баррель).", "Water was converted to the oil unit (exact barrel).", "Су мұнай бірлігіне ауыстырылды (дәл баррель).", "حُوّل الماء إلى وحدة النفط (البرميل الدقيق)."],
  LIQUID_CONVERTED_TO_OIL_UNIT: ["Жидкость переведена в единицу нефти.", "Liquid was converted to the oil unit.", "Сұйықтық мұнай бірлігіне ауыстырылды.", "حُوّلت السوائل إلى وحدة النفط."],
  GAS_M3_AS_STANDARD: ["Газ в м³ принят как стандартные м³.", "Gas in m³ is taken as standard m³.", "м³ газы стандарт м³ ретінде алынды.", "اعتُبر الغاز بالمتر المكعب أمتارًا قياسية."],
  GAS_PREFIX_EXPANDED: ["Газ в тыс./Mscf переведён в единицы (×1000).", "Gas in thousands/Mscf was expanded (×1000).", "Мың/Mscf газ бірліктерге ауыстырылды (×1000).", "وُسّع الغاز بالآلاف/Mscf ‏(×1000)."],
  WATER_DERIVED_FROM_LIQUID: ["Вода рассчитана как жидкость минус нефть.", "Water was derived as liquid minus oil.", "Су сұйықтықтан мұнайды шегеру арқылы есептелді.", "اشتُق الماء كالسوائل ناقص النفط."],
  COMMA_READ_AS_DECIMAL: ["Запятая в числах вида 1,234 прочитана как десятичная.", "A comma in numbers like 1,234 was read as a decimal point.", "1,234 түріндегі сандардағы үтір ондық деп оқылды.", "قُرئت الفاصلة في أرقام مثل 1,234 كفاصلة عشرية."],
  COMMA_READ_AS_THOUSANDS: ["Запятая в числах вида 1,234 прочитана как разделитель тысяч.", "A comma in numbers like 1,234 was read as a thousands separator.", "1,234 түріндегі сандардағы үтір мыңдық бөлгіш деп оқылды.", "قُرئت الفاصلة في أرقام مثل 1,234 كفاصل للآلاف."],
  SORTED_BY_PERIOD: ["Строки упорядочены по периоду.", "Rows were ordered by period.", "Жолдар кезең бойынша реттелді.", "رُتّبت الصفوف حسب الفترة."],
  ROW_SHAPE: ["Строка {row}: неверное число столбцов.", "Row {row}: wrong number of columns.", "{row}-жол: бағандар саны дұрыс емес.", "الصف {row}: عدد أعمدة غير صحيح."],
  PERIOD_INVALID: ["Строка {row}: период не распознан.", "Row {row}: period not recognised.", "{row}-жол: кезең танылмады.", "الصف {row}: لم تُعرف الفترة."],
  PERIOD_FORMAT_MIXED: ["Строка {row}: другой формат периода.", "Row {row}: a different period format.", "{row}-жол: кезеңнің басқа форматы.", "الصف {row}: تنسيق فترة مختلف."],
  NUMBER_UNREADABLE: ["Строка {row}: число не прочитано ({column}).", "Row {row}: unreadable number ({column}).", "{row}-жол: сан оқылмады ({column}).", "الصف {row}: رقم غير مقروء ({column})."],
  NEGATIVE_RATE: ["Строка {row}: отрицательный дебит ({column}).", "Row {row}: negative rate ({column}).", "{row}-жол: теріс дебит ({column}).", "الصف {row}: معدل سالب ({column})."],
  RATE_OUT_OF_RANGE: ["Строка {row}: дебит вне диапазона ({column}).", "Row {row}: rate out of range ({column}).", "{row}-жол: дебит ауқымнан тыс ({column}).", "الصف {row}: معدل خارج النطاق ({column})."],
  MISSING_OIL: ["Строка {row}: нет дебита нефти.", "Row {row}: no oil rate.", "{row}-жол: мұнай дебиті жоқ.", "الصف {row}: لا يوجد معدل للنفط."],
  LIQUID_BELOW_OIL: ["Строка {row}: жидкость меньше нефти.", "Row {row}: liquid below oil.", "{row}-жол: сұйықтық мұнайдан аз.", "الصف {row}: السوائل أقل من النفط."],
  WELL_MISSING: ["Строка {row}: нет скважины.", "Row {row}: no well.", "{row}-жол: ұңғыма жоқ.", "الصف {row}: لا توجد بئر."],
  IDENTITY_DATE: ["Строка {row}: скважина или ISO-дата не распознаны.", "Row {row}: well or ISO date not recognised.", "{row}-жол: ұңғыма немесе ISO күні танылмады.", "الصف {row}: لم تُعرف البئر أو تاريخ ISO."],
  MISSING_INVALID_RATE: ["Строка {row}: дебит пустой или нечисловой ({column}).", "Row {row}: empty or non-numeric rate ({column}).", "{row}-жол: дебит бос немесе сан емес ({column}).", "الصف {row}: معدل فارغ أو غير رقمي ({column})."],
  INVALID_DOWNTIME: ["Строка {row}: простой больше периода.", "Row {row}: downtime exceeds the period.", "{row}-жол: тоқтап тұру кезеңнен ұзақ.", "الصف {row}: التوقف يتجاوز الفترة."],
  DUPLICATE_CONFLICT: ["Строка {row}: повтор скважины и даты — дубли исключены.", "Row {row}: repeated well and date — duplicates excluded.", "{row}-жол: ұңғыма мен күн қайталанды — қайталанулар алынып тасталды.", "الصف {row}: تكرار البئر والتاريخ — استُبعدت التكرارات."],
  DUPLICATE_PERIOD: ["Строка {row}: повтор периода — все дубли исключены.", "Row {row}: repeated period — all duplicates excluded.", "{row}-жол: кезең қайталанды — барлық қайталанулар алынып тасталды.", "الصف {row}: فترة مكررة — استُبعدت كل التكرارات."],
  // Why the independent cross-check did not run
  CC_MASS_BASIS: ["модуль загрузки файлов не работает с тоннами", "the upload engine does not handle tonnes", "файл жүктеу модулі тоннамен жұмыс істемейді", "محرك الرفع لا يتعامل مع الأطنان"],
  CC_NO_CALENDAR_DATES: ["для него нужны календарные даты", "it needs calendar dates", "оған күнтізбелік күндер қажет", "يتطلب تواريخ تقويمية"],
  CC_WELL_ID_FORMAT: ["в названии скважины есть особые символы", "a well name has special characters", "ұңғыма атауында арнайы таңбалар бар", "يحتوي اسم البئر على رموز خاصة"],
  CC_NUMBER_FORMAT: ["есть числа в экспоненциальной записи", "some numbers are in exponent notation", "экспоненциалды жазудағы сандар бар", "توجد أرقام بصيغة أسية"],
  CC_NONE: ["—", "—", "—", "—"],
  // Hypotheses
  WATER_CONING: ["Конусообразование подошвенной воды", "Bottom-water coning", "Табан суының конус түзуі", "تخروط مياه القاع"],
  WATER_CHANNELING: ["Прорыв воды по высокопроницаемым пропласткам", "Water channelling through high-permeability layers", "Жоғары өткізгіш қабатшалар арқылы су жарылуы", "تسرب الماء عبر طبقات عالية النفاذية"],
  INJECTION_BREAKTHROUGH: ["Прорыв закачиваемой воды от нагнетательных скважин", "Injection-water breakthrough from injectors", "Айдау ұңғымаларынан айдалатын судың жарылуы", "اختراق مياه الحقن من آبار الحقن"],
  BEHIND_CASING_FLOW: ["Заколонный переток (цементное кольцо)", "Behind-casing flow (cement)", "Құбыр сыртындағы ағын (цемент сақинасы)", "تدفق خلف التغليف (الإسمنت)"],
  COMPLETION_LEAK: ["Негерметичность НКТ или эксплуатационной колонны", "Tubing or casing leak", "СКҚ немесе пайдалану бағанының саңылаусыздығы бұзылуы", "تسرب في أنابيب الإنتاج أو التغليف"],
  AQUIFER_ENCROACHMENT: ["Подход контурных (законтурных) вод", "Edge-water (aquifer) encroachment", "Контур суларының жақындауы", "زحف مياه الطبقة المائية"],
  MEASUREMENT_ALLOCATION: ["Ошибка замера или распределения добычи", "Measurement or allocation error", "Өлшеу немесе өндіруді бөлу қатесі", "خطأ في القياس أو التوزيع"],
  BELOW_BUBBLE_POINT: ["Снижение пластового давления ниже давления насыщения", "Reservoir pressure below the bubble point", "Қабат қысымы қанығу қысымынан төмен түсуі", "انخفاض ضغط المكمن دون نقطة الفقاعة"],
  GAS_CAP_CONING: ["Прорыв газа из газовой шапки", "Gas-cap gas coning", "Газ телпегінен газ жарылуы", "تخروط غاز القبعة الغازية"],
  GAS_MEASUREMENT: ["Ошибка замера газа", "Gas measurement error", "Газды өлшеу қатесі", "خطأ في قياس الغاز"],
  RESERVOIR_DEPLETION: ["Истощение пласта, падение пластового давления", "Reservoir depletion, falling pressure", "Қабаттың сарқылуы, қысымның төмендеуі", "استنزاف المكمن وانخفاض الضغط"],
  SKIN_DAMAGE: ["Ухудшение призабойной зоны (скин)", "Near-wellbore damage (skin)", "Түп маңы аймағының нашарлауы (скин)", "تضرر المنطقة القريبة من البئر (skin)"],
  LIFT_PERFORMANCE: ["Снижение производительности насоса или газлифта", "Pump or gas-lift underperformance", "Сорғы немесе газлифт өнімділігінің төмендеуі", "تراجع أداء المضخة أو الرفع بالغاز"],
  // Measurements
  WATER_CHEMISTRY: ["Химический анализ воды (минерализация, ионы) против пластовой и закачиваемой", "Water chemistry (salinity, ions) against formation and injection water", "Судың химиялық талдауы (минералдану, иондар) қабат және айдау суымен салыстыру", "تحليل كيمياء الماء (الملوحة والأيونات) مقابل ماء المكمن والحقن"],
  PLT: ["Промыслово-геофизические исследования притока (PLT)", "Production logging (PLT)", "Ағынды кәсіпшілік-геофизикалық зерттеу (PLT)", "تسجيل الإنتاج (PLT)"],
  RESERVOIR_PRESSURE: ["Замер пластового давления", "Reservoir pressure survey", "Қабат қысымын өлшеу", "قياس ضغط المكمن"],
  WELL_TEST: ["Гидродинамические исследования (КВД)", "Well test (pressure build-up)", "Гидродинамикалық зерттеу (ҚҚҚ)", "اختبار البئر (تراكم الضغط)"],
  CEMENT_LOG: ["Акустическая цементометрия (CBL)", "Cement bond log (CBL)", "Акустикалық цементометрия (CBL)", "سجل ترابط الإسمنت (CBL)"],
  OFFSET_INJECTION: ["История закачки соседних нагнетательных скважин", "Offset injector history", "Көрші айдау ұңғымаларының айдау тарихы", "تاريخ آبار الحقن المجاورة"],
  TEST_SEPARATOR: ["Контрольный замер на тестовом сепараторе", "Test-separator re-measurement", "Сынақ сепараторында бақылау өлшеуі", "إعادة القياس على فاصل الاختبار"],
  PVT_BUBBLE_POINT: ["PVT-анализ: давление насыщения", "PVT analysis: bubble-point pressure", "PVT талдауы: қанығу қысымы", "تحليل PVT: ضغط نقطة الفقاعة"],
  GAS_METER: ["Поверка газового расходомера", "Gas meter calibration", "Газ шығын өлшегішін тексеру", "معايرة عداد الغاز"],
  BOTTOMHOLE_PRESSURE: ["Забойное давление (динамический уровень)", "Bottom-hole flowing pressure (fluid level)", "Түп қысымы (динамикалық деңгей)", "ضغط قاع البئر أثناء التدفق (مستوى السائل)"],
  LIFT_DIAGNOSTICS: ["Диагностика насоса (динамограмма, токи)", "Lift diagnostics (dynamometer, currents)", "Сорғы диагностикасы (динамограмма, токтар)", "تشخيص الرفع (الديناموميتر والتيارات)"],
  // Warnings and limitations
  ENGINEER_REVIEW_REQUIRED: ["Решения по скважине принимает уполномоченный инженер.", "Well decisions belong to an authorised engineer.", "Ұңғыма бойынша шешімді уәкілетті инженер қабылдайды.", "قرارات البئر من صلاحية مهندس مخوّل."],
  TREND_EXTRAPOLATION_NOT_RESERVOIR_FORECAST: ["Сценарии — продолжение тренда, не прогноз пласта.", "Scenarios extend the trend; they are not a reservoir forecast.", "Сценарийлер — тренд жалғасы, қабат болжамы емес.", "السيناريوهات امتداد للاتجاه وليست توقعًا للمكمن."],
  SCENARIOS_NOT_CONFIDENCE_INTERVALS: ["Модели — сценарии, а не доверительный интервал.", "The models are scenarios, not a confidence interval.", "Модельдер — сценарийлер, сенімділік аралығы емес.", "النماذج سيناريوهات وليست فاصل ثقة."],
  MECHANISM_NOT_DETERMINED: ["Механизм изменения воды и газа по дебитам не определяется.", "Rates alone do not determine why water and gas changed.", "Су мен газ өзгерісінің механизмі дебиттер бойынша анықталмайды.", "لا تحدد المعدلات وحدها سبب تغير الماء والغاز."],
  USER_DATA_UNVERIFIED: ["Замеры получены от пользователя и не верифицированы (калибровка, распределение).", "Measurements come from the user and are unverified (calibration, allocation).", "Өлшемдер пайдаланушыдан алынған және тексерілмеген (калибрлеу, бөлу).", "القياسات من المستخدم وغير موثقة (المعايرة والتوزيع)."],
  NO_PRESSURE_PVT_DATA: ["Без давления и PVT выводы о пласте невозможны.", "Without pressure and PVT data no reservoir conclusion is possible.", "Қысым мен PVT деректерінсіз қабат туралы қорытынды мүмкін емес.", "لا يمكن استنتاج شيء عن المكمن دون بيانات الضغط وPVT."],
  NO_RESERVES_CLASSIFICATION: ["Запасы не оцениваются и не классифицируются (PRMS).", "Reserves are not estimated or classified (PRMS).", "Қорлар бағаланбайды және жіктелмейді (PRMS).", "لا تُقدّر الاحتياطيات ولا تُصنّف (PRMS)."],
  NO_EQUIPMENT_CONTROL: ["Никаких команд оборудованию: только поддержка решений.", "No equipment commands: decision support only.", "Жабдыққа ешқандай команда жоқ: тек шешімдерді қолдау.", "لا أوامر للمعدات: دعم القرار فقط."],
  CUMULATIVE_ASSUMES_AVERAGE_RATES: ["Накопленная добыча предполагает средние за период дебиты.", "Cumulative production assumes period-average rates.", "Жинақталған өндіру кезеңнің орташа дебиттерін болжайды.", "يفترض الإنتاج التراكمي معدلات متوسطة للفترة."],
  PRESSURE_DATUM_NOT_STATED: ["Pwf нормализовано в psi. Абсолютное или манометрическое давление не уточнено; депрессия и пластовое давление не вычисляются.", "Pwf is normalized to psi. Absolute/gauge datum is unspecified; drawdown and reservoir pressure are not inferred.", "Pwf psi бірлігіне келтірілді; абсолюттік/манометрлік негіз көрсетілмеген.", "حُوّل Pwf إلى psi؛ أساس الضغط المطلق/المقاس غير محدد ولا يُستنتج ضغط المكمن."],
  NO_PVT_DATA: ["Нет данных PVT: фазовые свойства и объёмные коэффициенты не вычислялись.", "No PVT data: phase properties and formation volume factors were not computed.", "PVT деректері жоқ; фазалық қасиеттер есептелмеді.", "لا توجد بيانات PVT؛ لم تُحسب خواص الأطوار أو معاملات الحجم."],
  GAS_CONDITIONS_REQUIRED: ["Укажите, при каких условиях измерен объём газа: стандартных, поверхностных или пластовых.", "Specify gas-volume measurement conditions: standard, surface or reservoir.", "Газ көлемінің өлшеу шарттарын көрсетіңіз.", "حدد ظروف قياس حجم الغاز."],
  AGGREGATE_TOTAL_MISMATCH: ["Объявленная итоговая сумма не совпадает с суммой скважин; итоговая строка не включена в добычу.", "Reported total disagrees with the well sum; total rows are excluded from production.", "Көрсетілген жиынтық ұңғымалар қосындысымен сәйкес емес.", "الإجمالي المعلن لا يطابق مجموع الآبار؛ استُبعد صف الإجمالي."],
  ECONOMICS_GROSS_PRETAX: ["Экономика — валовая выручка до налогов.", "Economics is gross pre-tax revenue.", "Экономика — салыққа дейінгі жалпы түсім.", "الاقتصاد إيراد إجمالي قبل الضرائب."],
}

/** What the answer asks for when a pasted table cannot be computed honestly. */
const NEEDS: Record<string, Four> = {
  UNIT_CONFLICT: ["Конфликт единиц: {columns}. Какое объявление верно?", "Conflicting units: {columns}. Which declaration is correct?", "Бірліктер қайшы: {columns}. Қайсысы дұрыс?", "وحدات متعارضة: {columns}. أي تصريح صحيح؟"],
  RESERVOIR_CONVERSION_REQUIRED: ["{columns}: пластовый объём нельзя приравнивать к поверхностному. Нужны объёмный коэффициент и условия измерения.", "{columns}: reservoir volume is not surface volume. Supply formation volume factor and measurement conditions.", "{columns}: қабаттық көлем үшін коэффициент пен өлшеу шарттары қажет.", "{columns}: حجم المكمن ليس حجماً سطحياً؛ يلزم معامل الحجم وظروف القياس."],
  TABLE_UNITS_OR_PERIODS_CONFLICT: ["Таблицы имеют несовместимые единицы или временные оси: {columns}.", "Tables have incompatible units or time axes: {columns}.", "Кестелердің бірліктері немесе уақыт осьтері үйлеспейді: {columns}.", "وحدات الجداول أو محاورها الزمنية غير متوافقة: {columns}."],
  DUPLICATE_WELL_PERIOD_ACROSS_TABLES: ["Повтор скважины и периода в разных таблицах: {columns}. Уточните, какая запись является исходной.", "Duplicate well/period across tables: {columns}. Identify the source record.", "Әртүрлі кестелерде қайталанған ұңғыма/кезең: {columns}.", "بئر/فترة مكررة بين الجداول: {columns}."],
  UNITS_MISSING: ["В таблице нет единиц для столбцов: {columns}. Я не угадываю единицы — допишите их в заголовок (например, «Нефть, bbl/day» или «Вода, м3/сут») или одной строкой: «дебиты в м3/сут».", "The table has no units for: {columns}. Units are never guessed — add them to the header (e.g. “Oil, bbl/day”) or say “rates in m3/day”.", "Кестеде мына бағандардың бірліктері жоқ: {columns}. Бірліктерді болжамаймын — тақырыпқа жазыңыз (мысалы, «Мұнай, м3/тәул») немесе «дебиттер м3/тәул» деп көрсетіңіз.", "لا توجد وحدات للأعمدة: {columns}. لا أخمّن الوحدات — أضفها إلى العنوان (مثل «النفط bbl/day») أو اكتب «المعدلات بـ m3/day»."],
  RATE_BASIS_MISSING: ["Для столбцов {columns} не указано, что это суточные дебиты. Нужны значения в сутки (bbl/day, м3/сут, т/сут); месячные объёмы пересчитайте или укажите «/сут».", "Columns {columns} are not marked as daily rates. Rates per day are required (bbl/day, m3/day, t/day).", "{columns} бағандары тәуліктік дебит екені көрсетілмеген. Тәулігіне мәндер қажет (bbl/day, м3/тәул, т/тәул).", "لم يُذكر أن الأعمدة {columns} معدلات يومية. يلزم معدل لكل يوم (bbl/day أو m3/day أو t/day)."],
  OIL_DENSITY_REQUIRED: ["Нефть дана в тоннах, а вода в объёме. Укажите плотность нефти, например «плотность 850 кг/м3», — без неё обводнённость не считается.", "Oil is in tonnes and water by volume. State the oil density, e.g. “density 850 kg/m3”; water cut cannot be computed without it.", "Мұнай тоннамен, су көлеммен берілген. Мұнай тығыздығын көрсетіңіз, мысалы «тығыздығы 850 кг/м3».", "النفط بالأطنان والماء بالحجم. اذكر كثافة النفط، مثل «الكثافة 850 kg/m3»."],
  WATER_MASS_WITH_OIL_VOLUME: ["Вода дана в тоннах, а нефть в объёме. Приведите воду к объёму или нефть к тоннам.", "Water is in tonnes and oil by volume. Put both on the same basis.", "Су тоннамен, мұнай көлеммен берілген. Екеуін бір базиске келтіріңіз.", "الماء بالأطنان والنفط بالحجم. وحّد الأساس."],
  OIL_UNIT_UNSUPPORTED: ["Единица нефти не поддерживается: {columns}. Используйте bbl/day, м3/сут или т/сут.", "Unsupported oil unit: {columns}. Use bbl/day, m3/day or t/day.", "Мұнай бірлігі қолдау көрсетілмейді: {columns}. bbl/day, м3/тәул немесе т/тәул қолданыңыз.", "وحدة النفط غير مدعومة: {columns}. استخدم bbl/day أو m3/day أو t/day."],
  WATER_UNIT_UNSUPPORTED: ["Единица воды/жидкости не поддерживается: {columns}.", "Unsupported water/liquid unit: {columns}.", "Су/сұйықтық бірлігі қолдау көрсетілмейді: {columns}.", "وحدة الماء/السوائل غير مدعومة: {columns}."],
  GAS_UNIT_UNSUPPORTED: ["Единица газа не поддерживается: {columns}. Используйте scf/day, Mscf/day, ст. м3/сут или тыс. м3/сут.", "Unsupported gas unit: {columns}. Use scf/day, Mscf/day, sm3/day or thousand m3/day.", "Газ бірлігі қолдау көрсетілмейді: {columns}.", "وحدة الغاز غير مدعومة: {columns}."],
  DUPLICATE_COLUMN_ROLE: ["В таблице два столбца одного вида (например, две нефти). Оставьте по одному столбцу на нефть, воду и газ.", "Two columns of the same kind (e.g. two oil columns). Keep one column each for oil, water and gas.", "Бір түрдегі екі баған бар. Мұнай, су және газ үшін бір-бір бағаннан қалдырыңыз.", "يوجد عمودان من النوع نفسه. أبقِ عمودًا واحدًا لكل من النفط والماء والغاز."],
  TOO_MANY_ROWS: ["Больше 5000 строк в сообщении. Загрузите файл CSV/XLSX.", "More than 5000 rows in a message. Attach a CSV/XLSX file instead.", "Хабарламада 5000-нан көп жол. CSV/XLSX файлын жүктеңіз.", "أكثر من 5000 صف في الرسالة. أرفق ملف CSV/XLSX."],
  NO_VALID_ROWS: ["Ни одна строка не прочитана: проверьте периоды (2026-01, 01.2026, «Январь 2026») и числа.", "No row could be read: check the periods (2026-01, Jan 2026) and numbers.", "Бірде-бір жол оқылмады: кезеңдер мен сандарды тексеріңіз.", "تعذّرت قراءة أي صف: تحقق من الفترات والأرقام."],
  TABLE_CONTRACT_REJECTED: ["Таблица не прошла проверку контракта данных (порядок периодов или размеры).", "The table failed the data contract (period order or size).", "Кесте деректер келісімшартынан өтпеді.", "لم يجتز الجدول عقد البيانات."],
}

export type OilWordKey = keyof typeof WORDS

function fill(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => key in values ? String(values[key]) : whole)
}

export function oilWord(language: OilLanguage, key: OilWordKey, values?: Record<string, string | number>) {
  return fill((WORDS[key] as Four)[INDEX[language]], values)
}

export function oilCode(language: OilLanguage, code: string, values?: Record<string, string | number>) {
  const entry = CODES[code]
  return entry ? fill(entry[INDEX[language]], values) : code
}

export function oilNeedsInput(language: OilLanguage, code: string, columns: string[]) {
  const entry = NEEDS[code] || NEEDS.NO_VALID_ROWS
  return fill(entry[INDEX[language]], { columns: columns.map((name) => `«${name.replace(/[«»|`]/g, "").slice(0, 60)}»`).join(", ") })
}

// ─── Numbers ─────────────────────────────────────────────────────────────

const MINUS = "−"

/** A number in the report's language: «1 234,56» (RU/KK), «1,234.56» (EN/AR, Western digits). */
export function oilNumber(value: number | null | undefined, language: OilLanguage, digits = 2, options: { trim?: boolean; sign?: boolean } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  const rounded = Number(value.toFixed(digits))
  const negative = rounded < 0
  let [whole, fraction = ""] = Math.abs(rounded).toFixed(digits).split(".")
  if (options.trim) fraction = fraction.replace(/0+$/, "")
  const group = language === "ru" || language === "kk" ? "\u00a0" : ","
  if (whole.length > 4 || (language !== "ru" && language !== "kk" && whole.length > 3)) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group)
  const decimal = language === "ru" || language === "kk" ? "," : "."
  const text = fraction ? `${whole}${decimal}${fraction}` : whole
  return `${negative ? MINUS : options.sign && rounded > 0 ? "+" : ""}${text}`
}

/** Rates and volumes: up to two decimals, none for large values, no trailing zeros. */
export function oilRate(value: number | null | undefined, language: OilLanguage) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  const digits = Math.abs(value) >= 10_000 ? 0 : Math.abs(value) >= 1 || value === 0 ? 2 : 4
  return oilNumber(value, language, digits, { trim: true })
}

export function oilPercent(fraction: number | null | undefined, language: OilLanguage, options: { sign?: boolean } = {}) {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—"
  return `${oilNumber(fraction * 100, language, 2, options)}\u00a0%`
}

export function oilUnit(unit: string | null | undefined, language: OilLanguage) {
  if (!unit) return ""
  if (unit === "pp") return oilWord(language, "pp")
  if (unit === "ratio" || unit === "fraction") return ""
  return unit.replace("m3", "m³").replace("sm3", "sm³")
}

// ─── Periods ─────────────────────────────────────────────────────────────

const MONTH_SHORT: Record<OilLanguage, string[]> = {
  ru: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  kk: ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
}

export type PeriodContext = { granularity: "month" | "day" | "index"; calendar: boolean; firstT: number; lastT: number }

/** A label for a time value: «авг 2026», «2026-03-15», or the source's own label / «+2» for scenarios. */
export function oilPeriod(t: number, context: PeriodContext, language: OilLanguage, sourceLabel?: string, short = false) {
  if (context.calendar && context.granularity === "month") {
    const year = Math.floor(t / 12), month = ((t % 12) + 12) % 12
    return short ? MONTH_SHORT[language][month] : `${MONTH_SHORT[language][month]} ${year}`
  }
  if (context.calendar && context.granularity === "day") return new Date(t * 86_400_000).toISOString().slice(0, 10)
  if (sourceLabel) return sourceLabel
  return t > context.lastT ? `+${oilNumber(t - context.lastT, language, 0)}` : oilNumber(t, language, 0)
}

function plural(language: OilLanguage, count: number, forms: Four[]): string {
  const n = Math.abs(Math.round(count))
  if (language === "ru") {
    const [one, few, many] = forms.map((form) => form[0])
    const mod10 = n % 10, mod100 = n % 100
    return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many
  }
  if (language === "en") return n === 1 ? forms[0][1] : forms[1][1]
  if (language === "kk") return forms[0][2]
  return n === 1 ? forms[0][3] : n === 2 ? forms[1][3] : n >= 3 && n <= 10 ? forms[2][3] : forms[1][3]
}

const UNIT_FORMS: Record<"month" | "day" | "index" | "well", Four[]> = {
  month: [["месяц", "month", "ай", "شهر"], ["месяца", "months", "ай", "شهرًا"], ["месяцев", "months", "ай", "أشهر"]],
  day: [["день", "day", "күн", "يوم"], ["дня", "days", "күн", "يومًا"], ["дней", "days", "күн", "أيام"]],
  index: [["период", "period", "кезең", "فترة"], ["периода", "periods", "кезең", "فترة"], ["периодов", "periods", "кезең", "فترات"]],
  well: [["скважина", "well", "ұңғыма", "بئر"], ["скважины", "wells", "ұңғыма", "بئرًا"], ["скважин", "wells", "ұңғыма", "آبار"]],
}

export function oilCount(language: OilLanguage, count: number, kind: keyof typeof UNIT_FORMS) {
  return `${oilNumber(count, language, 0)}\u00a0${plural(language, count, UNIT_FORMS[kind])}`
}

// ─── Conclusion ──────────────────────────────────────────────────────────

const MODEL_IN_SENTENCE: Record<string, Four> = {
  hyperbolic: ["гиперболической", "hyperbolic", "гиперболалық", "الزائدي"],
  linear: ["линейной", "the linear", "сызықтық", "الخطي"],
  exponential: ["экспоненциальной", "the exponential", "экспоненциалды", "الأسي"],
  harmonic: ["гармонической", "the harmonic", "гармоникалық", "التوافقي"],
}

/**
 * The engineering conclusion: sentences assembled from computed numbers.
 * Each sentence states a calculation; mechanisms are left to the hypotheses.
 */
export function oilConclusion(result: PetroleumAnalysisResult, well: OilWellAnalysis, language: OilLanguage): string[] {
  const units = result.validatedInputs.units
  const L = oilUnit(units.liquid, language)
  const G = oilUnit(units.gas, language)
  const R = oilUnit(units.gor, language)
  const kind = result.sourceSummary.granularity
  const span = oilCount(language, well.elapsed, kind === "month" ? "month" : kind === "day" ? "day" : "index")
  const lines: string[] = []
  const n = well.t.length
  const first = well.first, last = well.last, change = well.change
  const say = (ru: string, en: string, kk: string, ar: string) => lines.push([ru, en, kk, ar][INDEX[language]])
  if (n < 2) {
    say("Одна точка данных: изменения и тренды не рассчитываются.", "A single data point: no changes or trends can be computed.", "Бір деректер нүктесі: өзгерістер мен трендтер есептелмейді.", "نقطة بيانات واحدة: لا يمكن حساب التغيرات أو الاتجاهات.")
    return lines
  }
  const oilFrom = oilRate(first.oil, language), oilTo = oilRate(last.oil, language)
  const oilPct = oilPercent(change.oil === null ? null : Math.abs(change.oil), language)
  if (change.oil !== null && change.oil < 0) say(`За ${span} дебит нефти снизился на ${oilPct} — с ${oilFrom} до ${oilTo} ${L}.`, `Over ${span} the oil rate fell by ${oilPct}, from ${oilFrom} to ${oilTo} ${L}.`, `${span} ішінде мұнай дебиті ${oilPct} төмендеді — ${oilFrom}-ден ${oilTo} ${L}-ге дейін.`, `خلال ${span} انخفض معدل النفط بنسبة ${oilPct}، من ${oilFrom} إلى ${oilTo} ${L}.`)
  else if (change.oil !== null && change.oil > 0) say(`За ${span} дебит нефти вырос на ${oilPct} — с ${oilFrom} до ${oilTo} ${L}.`, `Over ${span} the oil rate rose by ${oilPct}, from ${oilFrom} to ${oilTo} ${L}.`, `${span} ішінде мұнай дебиті ${oilPct} өсті — ${oilFrom}-ден ${oilTo} ${L}-ге дейін.`, `خلال ${span} ارتفع معدل النفط بنسبة ${oilPct}، من ${oilFrom} إلى ${oilTo} ${L}.`)
  else say(`За ${span} дебит нефти не изменился: ${oilTo} ${L}.`, `Over ${span} the oil rate did not change: ${oilTo} ${L}.`, `${span} ішінде мұнай дебиті өзгерген жоқ: ${oilTo} ${L}.`, `خلال ${span} لم يتغير معدل النفط: ${oilTo} ${L}.`)

  const stats = well.liquidStats, balance = well.balance
  if (stats && balance) {
    const mean = oilRate(stats.mean, language), cv = oilNumber((stats.cv ?? 0) * 100, language, 2)
    const lost = oilRate(Math.abs(balance.deltaOil), language)
    const replaced = balance.replacement
    if (stats.stable && balance.deltaOil < 0 && replaced !== null && Math.abs(replaced - 1) <= 0.02) say(
      `Дебит жидкости стабилен (${mean} ${L}, CV ${cv} %), поэтому снижение нефти на ${lost} ${L} полностью замещено ростом воды.`,
      `The liquid rate is stable (${mean} ${L}, CV ${cv} %), so the ${lost} ${L} oil loss was fully replaced by water.`,
      `Сұйықтық дебиті тұрақты (${mean} ${L}, CV ${cv} %), сондықтан мұнайдың ${lost} ${L} азаюы толығымен судың өсуімен алмасты.`,
      `معدل السوائل ثابت (${mean} ${L}، CV ${cv} %)، لذا حلّ الماء بالكامل محل فقد النفط البالغ ${lost} ${L}.`)
    else if (balance.deltaOil < 0 && replaced !== null) say(
      `Рост воды покрывает ${oilPercent(replaced, language)} снижения нефти; жидкость изменилась на ${oilPercent(change.liquid, language, { sign: true })}.`,
      `Rising water offsets ${oilPercent(replaced, language)} of the oil loss; liquid changed by ${oilPercent(change.liquid, language, { sign: true })}.`,
      `Судың өсуі мұнай азаюының ${oilPercent(replaced, language)} өтейді; сұйықтық ${oilPercent(change.liquid, language, { sign: true })} өзгерді.`,
      `يعوّض ارتفاع الماء ${oilPercent(replaced, language)} من فقد النفط؛ وتغيرت السوائل بنسبة ${oilPercent(change.liquid, language, { sign: true })}.`)
    else say(`Дебит жидкости: ${oilRate(first.liquid, language)} → ${oilRate(last.liquid, language)} ${L} (CV ${cv} %).`, `Liquid rate: ${oilRate(first.liquid, language)} → ${oilRate(last.liquid, language)} ${L} (CV ${cv} %).`, `Сұйықтық дебиті: ${oilRate(first.liquid, language)} → ${oilRate(last.liquid, language)} ${L} (CV ${cv} %).`, `معدل السوائل: ${oilRate(first.liquid, language)} → ${oilRate(last.liquid, language)} ${L} ‏(CV ${cv} %).`)
  }
  if (change.wcPP !== null && first.wc !== null && last.wc !== null) {
    const a = oilPercent(first.wc, language), b = oilPercent(last.wc, language)
    const pp = `${oilNumber(change.wcPP, language, 2, { sign: true })} ${oilWord(language, "pp")}`
    const mass = units.basis === "mass"
    if (change.wcPP > 0) say(`Обводнённость${mass ? " (по массе)" : ""} выросла с ${a} до ${b} (${pp}).`, `Water cut${mass ? " (by mass)" : ""} rose from ${a} to ${b} (${pp}).`, `Сулану${mass ? " (массасы бойынша)" : ""} ${a}-дан ${b}-ға дейін өсті (${pp}).`, `ارتفعت نسبة الماء${mass ? " (بالكتلة)" : ""} من ${a} إلى ${b} ‏(${pp}).`)
    else if (change.wcPP < 0) say(`Обводнённость снизилась с ${a} до ${b} (${pp}).`, `Water cut fell from ${a} to ${b} (${pp}).`, `Сулану ${a}-дан ${b}-ға дейін төмендеді (${pp}).`, `انخفضت نسبة الماء من ${a} إلى ${b} ‏(${pp}).`)
    else say(`Обводнённость не изменилась: ${b}.`, `Water cut did not change: ${b}.`, `Сулану өзгерген жоқ: ${b}.`, `لم تتغير نسبة الماء: ${b}.`)
  }
  if (change.gorRel !== null && first.gor !== null && last.gor !== null) {
    const pct = oilPercent(Math.abs(change.gorRel), language)
    const gasPart = change.gas === null ? "" : ` ${["газ", "gas", "газ", "الغاز"][INDEX[language]]} ${oilPercent(change.gas, language, { sign: true })}`
    const range = `${oilRate(first.gor, language)} → ${oilRate(last.gor, language)} ${R}`
    if (change.gorRel > 0) say(`GOR вырос на ${pct} (${range}); изменение газа:${gasPart}. Причина роста отношения не установлена.`, `GOR rose by ${pct} (${range}); gas change:${gasPart}. The cause of the ratio change is not established.`, `GOR ${pct} өсті (${range}); газ өзгерісі:${gasPart}. Қатынас өзгеруінің себебі анықталмаған.`, `ارتفع GOR بنسبة ${pct} ‏(${range})؛ تغير الغاز:${gasPart}. سبب تغير النسبة غير مثبت.`)
    else if (change.gorRel < 0) say(`GOR снизился на ${pct} (${range}).`, `GOR fell by ${pct} (${range}).`, `GOR ${pct} төмендеді (${range}).`, `انخفض GOR بنسبة ${pct} ‏(${range}).`)
    else say(`GOR не изменился: ${oilRate(last.gor, language)} ${R}.`, `GOR did not change: ${oilRate(last.gor, language)} ${R}.`, `GOR өзгерген жоқ: ${oilRate(last.gor, language)} ${R}.`, `لم يتغير GOR: ‏${oilRate(last.gor, language)} ${R}.`)
    void G
  }
  const best = well.models.find((fit) => fit.model === well.selected)
  if (best && best.r2 !== null) {
    const model = MODEL_IN_SENTENCE[best.model][INDEX[language]]
    say(`История лучше всего описывается ${model} моделью (R² ${oilNumber(best.r2, language, 3)}); это совпадение с прошлым, а не прогноз пласта.`, `The history is best described by ${model} model (R² ${oilNumber(best.r2, language, 3)}); that is a fit to the past, not a reservoir forecast.`, `Тарихты ${model} модель жақсы сипаттайды (R² ${oilNumber(best.r2, language, 3)}); бұл өткенмен сәйкестік, қабат болжамы емес.`, `يصف النموذج ${model} التاريخ بأفضل شكل (R² ‏${oilNumber(best.r2, language, 3)})؛ هذه مطابقة للماضي وليست توقعًا للمكمن.`)
  }
  if (well.hypotheses.measurements.length) say("Механизм по одним дебитам не определяется — ниже гипотезы и замеры, которые их различат.", "Rates alone do not identify the mechanism — the hypotheses below list the measurements that tell them apart.", "Механизм тек дебиттер бойынша анықталмайды — төменде гипотезалар мен оларды ажырататын өлшеулер.", "لا تحدد المعدلات وحدها الآلية — أدناه الفرضيات والقياسات التي تميّز بينها.")
  return lines.map((line) => oilBidi(line, language))
}

export function isRtl(language: OilLanguage) { return language === "ar" }

/**
 * Arabic sentences keep numbers with their units readable: each «120 bbl/day»,
 * «16.67 %» or «500 → 646.15 scf/bbl» is isolated left-to-right (Unicode LRI…PDI).
 */
const LTR_RUN = /(?:CV\s)?[−+]?\d[\d.,\u00a0]*(?:\s?%|\s?[A-Za-z][A-Za-z³/]*)?(?:\s?→\s?[−+]?\d[\d.,\u00a0]*(?:\s?%|\s?[A-Za-z][A-Za-z³/]*)?)?/g
export function oilBidi(text: string, language: OilLanguage) {
  return language === "ar" ? text.replace(LTR_RUN, (run) => `\u2066${run}\u2069`) : text
}
