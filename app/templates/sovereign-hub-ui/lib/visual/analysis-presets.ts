/** MALIK Visual Intelligence catalog: 100 task specifications, NOT 100 implemented compute engines.
 * The first 50 are the user's oil/production visual requests; 51–100 extend petroleum,
 * physics, mathematics, logic, chemistry and statistics. A preset only instructs the
 * existing validated Visual Engine on what visualization may be useful.
 * Never synthesize field observations or scientific measurements to fill a plot.
 */
export type AnalysisDomain = "petroleum" | "physics" | "math" | "logic" | "chemistry" | "statistics" | "general"
export type AnalysisVisualKind = "chart" | "dashboard" | "calculator" | "table" | "graph"
export type AnalysisPreset = {
  id: number; name: string; domain: AnalysisDomain; kind: AnalysisVisualKind;
  keywords: readonly string[]; required: string; readiness: "specification"
}

const ROWS = `
01|petroleum|dashboard|Production Command Grid|добыч,production,промысл|дебиты по скважинам и периодам
02|petroleum|chart|Well Month Heatmap|теплов,heatmap,по месяц,month|матрица скважина-период, фактические дебиты
03|petroleum|chart|Oil Water Gas Flow|нефт и вод,oil water,фазов,gas flow|согласованные фазовые дебиты
04|petroleum|dashboard|Multi Well Sparklines|скважин по,well trend,sparklin|помесячная история нескольких скважин
05|petroleum|chart|Production Loss Waterfall|потер добыч,loss waterfall,production loss|причины и объёмы потерь
06|petroleum|chart|Water Cut Evolution|обводнен,water cut,watercut|нефть и вода с периодами
07|petroleum|chart|WOR Diagnostic Grid|водонефт,wor|совместимые нефтяные и водяные дебиты
08|petroleum|chart|Chan Diagnostic Plots|chan,производн wor|история WOR с достаточным количеством точек
09|petroleum|chart|Decline Forecast Fan|decline,падени дебит,прогноз добыч|история добычи и допущения сценариев
10|petroleum|table|Downtime Timeline|просто,останов,добыч простои,downtime|интервалы остановок и часы работы
11|petroleum|table|PVT Quality Matrix|pvt,лаборатор|измерения PVT, температура и давление
12|petroleum|chart|Bo Pressure Curves|объемн коэффициент,formation volume,bo pressure|PVT-таблица с Bo и давлением
13|petroleum|chart|Solution GOR Curves|растворен газ,solution gor,rs pressure|Rs и давление при указанной температуре
14|petroleum|chart|Viscosity Surface|вязк,viscosity|измерения вязкости при P и T
15|petroleum|chart|Phase Envelope|фазов диаграмм,phase envelope,dew point|состав флюида, модель фазовых равновесий
16|petroleum|table|Gas Z Factor Grid|z factor,сверхсжима,коэффициент z|давление, температура, применимость корреляции
17|petroleum|chart|Compressibility Analysis|сжимаем,compressibility|зависимость коэффициента сжимаемости от P
18|petroleum|chart|PTA Log Log Studio|pta,квд,кпд,pressure transient|давление и время испытания
19|petroleum|chart|Horner Analysis|horner,хорнер|давление и временные интервалы КВД
20|petroleum|chart|IPR VLP Intersection|ipr,vlp,узлов анализ|фактические IPR и VLP по одинаковым условиям
21|petroleum|chart|Well Log Studio|каротаж,well log,las|глубины и калиброванные кривые
22|petroleum|table|Facies Column|фаци,facies|стратиграфические интервалы и фации
23|petroleum|chart|Porosity Permeability Crossplot|пористост,проницаем,porosity permeability|парные измерения керна
24|petroleum|chart|Water Saturation Matrix|водонасыщ,sw,archie|каротаж, Rw и допущения модели
25|petroleum|table|Net Pay Layer Grid|продуктивн интервал,net pay|пороговые критерии и толщины слоёв
26|petroleum|chart|Fracture Rose Diagram|трещин,fracture rose|азимуты трещин и выборка
27|petroleum|chart|Vuggy Carbonate Map|каверн,vuggy|геологические измерения кавернозности
28|petroleum|graph|Dual Porosity Grid|двойн порист,dual porosity|параметры матрицы и трещин
29|petroleum|chart|Volumetric Uncertainty|объём запас,volumetric,неопределен запас|обоснованные входные диапазоны параметров
30|petroleum|graph|Reservoir Structure Grid|структурн сетк,геологическ 3d,reservoir structure|лицензированные данные геологической структуры
31|petroleum|graph|Injector Producer Map|нагнетательн,injector producer|координаты добывающих и нагнетательных скважин
32|petroleum|chart|Voidage Replacement Grid|vrr,замещен объем,voidage|объёмы отбора и закачки на одной основе
33|petroleum|chart|Water Breakthrough Timeline|прорыв вод,water breakthrough|свидетельства роста воды и даты
34|petroleum|chart|Hall Plot Analysis|hall plot,график холл|давление закачки и накопленные объёмы
35|petroleum|chart|Injection Response Matrix|отклик закач,влияни закач,injection response|совместные временные ряды закачки и добычи
36|petroleum|chart|ESP Performance Curves|эцн,esp,насос|паспортные характеристики ЭЦН
37|petroleum|graph|Nodal Flow Network|nodal,узлов модел|данные труб, фаз и давлений
38|petroleum|table|Artificial Lift Matrix|механизирован,artificial lift|данные оборудования и эксплуатации
39|petroleum|table|Well Integrity Grid|целостност скважин,well integrity|испытания барьеров и журнал событий
40|petroleum|table|Operations Risk Timeline|промысл риск,operations risk|журнал подтверждённых рисков и событий
41|petroleum|chart|Cash Flow Waterfall|денежн поток,cash flow|периодические денежные потоки
42|petroleum|chart|NPV IRR Scenario Lab|npv,irr,дисконтирован|денежные потоки, ставка и валюта
43|petroleum|chart|Tornado Sensitivity|торнадо,tornado,sensitivity|допущения диапазонов экономических параметров
44|petroleum|chart|Break Even Price Grid|безубыточн цен,break even price|цены, себестоимость, нефть и периоды
45|petroleum|dashboard|CAPEX OPEX Treemap|capex,opex,затрат|смета CAPEX и OPEX
46|petroleum|chart|Carbon Intensity Grid|углеродн интенсив,carbon intensity|активность и аттестованные коэффициенты
47|petroleum|chart|Methane Flaring Monitor|метан,факельн,methane,flaring|измерения или отчётность по выбросам
48|petroleum|chart|Produced Water Balance|пластов вод,produced water|учёт добываемой и закачиваемой воды
49|petroleum|dashboard|Asset Portfolio Matrix|портфель месторожд,asset portfolio|согласованные показатели нескольких активов
50|petroleum|dashboard|Malik Oil Executive Cockpit|нефтяная аналитика,oil executive|проверенные сводные KPI активов
51|petroleum|chart|Pressure Drawdown Grid|депресси,drawdown|забойное и пластовое давление
52|petroleum|chart|Reservoir Contact Tracking|гнк,внк,fluid contact|подтверждённые отметки контактов и дата
53|petroleum|chart|Water Flood Front Matrix|фронт заводнен,water flood front|наблюдения насыщенности, а не выдуманный фронт
54|petroleum|chart|Gas Lift Allocation Lab|газлифт,gas lift|дебиты газа, расчётные ограничения
55|petroleum|chart|Choke Performance Envelope|штуцер,choke|давление до и после штуцера, PVT
56|petroleum|table|Drilling Mud Window|буров раствор,mud window|градиенты порового давления и гидроразрыва
57|petroleum|chart|Wellbore Temperature Profile|термограмм скважин,wellbore temperature|профиль температуры по глубине
58|petroleum|chart|Wellbore Pressure Gradient|градиент давлен,wellbore pressure|давление по глубине и тип флюида
59|petroleum|graph|Drilling Event Sequence|бурени по этап,drilling events|реальные события бурения и время
60|petroleum|chart|Drilling ROP Performance|механическ скорост бур,rop|глубина, время, проходка
61|petroleum|chart|Core Sample Property Crossplot|керн,core sample|сопоставленные лабораторные свойства
62|petroleum|chart|Seismic Attribute Comparison|сейсмич атрибут,seismic attribute|лицензированные сейсмические атрибуты
63|petroleum|chart|Material Balance Diagnostic|материал баланс,material balance|PVT, добыча и давление по периодам
64|petroleum|chart|Recovery Factor Scenarios|коэффициент извлечен,recovery factor|исходный объём, извлечённое и сценарии
65|petroleum|chart|Gas Condensate Dropout|конденсат,condensate dropout|лабораторные данные фазового поведения
66|petroleum|table|H2S Exposure Safety Matrix|сероводород,h2s|измерения концентрации и утверждённые пороги
67|petroleum|chart|Pipeline Pressure Loss|потер давления трубопровод,pipeline pressure|расход, свойства, геометрия и условия
68|petroleum|graph|Separator Phase Routing|сепаратор,separator|измеренные входы и выходы фаз
69|petroleum|chart|Leak Detection Evidence Review|подозрен утеч,leak detection|датчики, баланс потоков и журнал событий
70|petroleum|dashboard|Field Digital Twin Readiness|цифров двойник месторожд,digital twin oil|проверка наличия данных, а не имитация двойника
71|physics|chart|Kinematics Position Time|кинематик,пути от времен,position time|начальные координаты, скорость, ускорение
72|physics|chart|Velocity Acceleration Grid|ускорен,velocity acceleration|скорость и ускорение со временем
73|physics|chart|Projectile Trajectory|брос,полёт тел,projectile|начальная скорость, угол и ускорение g
74|physics|calculator|Free Fall Time Lab|свободн паден,free fall|высота и ускорение свободного падения
75|physics|chart|Newton Force Balance|сила ньютон,force balance|массы, силы, направления
76|physics|calculator|Ohm Circuit Lab|закон ома,закону ома,ohm,сопротивлен,напряжен|напряжение и сопротивление
77|physics|chart|RC Transient Response|rc цеп,rc circuit,конденсатор|R, C, исходное напряжение, время
78|physics|chart|Harmonic Oscillator|гармоническ колебан,oscillator,маятник|амплитуда, период или масса и жёсткость
79|physics|chart|Heat Transfer Profile|теплопередач,heat transfer|теплопроводность и граничные условия
80|physics|calculator|Ideal Gas State|идеальн газ,ideal gas|n, T, P с явными абсолютными единицами
81|math|chart|Function Plot Studio|график функц,function plot,y=|формула функции и область определения
82|math|chart|Derivative Tangent Study|производн,derivative|функция и точка дифференцирования
83|math|chart|Integral Area Studio|интеграл,integral|подынтегральная функция и границы
84|math|chart|Equation Root Comparison|корни уравнен,equation roots|уравнение и область поиска корней
85|math|chart|Probability Distribution Lab|вероятност,probability distribution|параметры распределения
86|math|chart|Regression Residual Matrix|регресс,regression residual|парные наблюдения и метод
87|math|chart|Correlation Scatter Matrix|корреляц,correlation|сопоставимые столбцы наблюдений
88|logic|table|Truth Table Generator|таблиц истинност,truth table,булев|логическая формула и переменные
89|logic|graph|Proof Dependency Graph|доказательств,proof graph|условия, утверждения и зависимости
90|logic|graph|Decision Tree Reasoning|дерево решен,decision tree|условия и альтернативы
91|logic|graph|Algorithm Complexity Tree|сложност алгоритм,complexity,big o|алгоритм и условия анализа
92|logic|graph|Graph Path Explorer|кратчайш пут,shortest path,граф пут|вершины, рёбра и веса
93|chemistry|chart|Reaction Rate Curve|скорост реакци,reaction rate|концентрации по времени
94|chemistry|chart|Titration Curve|титрован,titration|состав, объёмы и измерения pH
95|chemistry|chart|Stoichiometry Balance Grid|стехиометр,stoichiometry|сбалансированное уравнение и количества
96|statistics|chart|Uncertainty Interval Studio|доверительн интервал,confidence interval|оценка, выборка и предположения
97|statistics|chart|Time Series Seasonality|сезонност,seasonality|временной ряд достаточной длины
98|general|table|Unit Conversion Audit|перевод единиц,unit conversion|число, исходная и целевая единицы
99|general|graph|Evidence And Assumptions Map|проверка гипотез,evidence map|наблюдения, допущения и источники
100|general|dashboard|Cross Domain Analysis Cockpit|многодисциплинар,cross domain,анализ данные|валидированные измерения и расчёты
`
export const ANALYSIS_PRESETS: readonly AnalysisPreset[] = ROWS.trim().split("\n").map((line) => {
  const parts = line.split("|")
  if (parts.length !== 6) throw new Error("Invalid analysis catalog entry")
  const [id, domain, kind, name, keywords, required] = parts
  return {
    id: Number(id), domain: domain as AnalysisDomain, kind: kind as AnalysisVisualKind,
    name, keywords: keywords.split(",").map((item) => item.trim()),
    required, readiness: "specification" as const,
  }
})

const DOMAINS: ReadonlyArray<[AnalysisDomain, RegExp]> = [
  ["petroleum", /(?:@malik oil ai|нефт|мұнай|скважин|дебит|бурен|пластов|карбонатн|газодобыч|пластов(?:ое|ого)|\b(?:petroleum|oilfield|oil well|oil production|reservoir|wellbore|pvt|gor|wor|h2s|adnoc)\b)/iu],
  ["logic", /(?:логик|булев|истинност|доказательств|алгоритм|дерево решен|кратчайш пут|\b(?:logic|boolean|truth table|algorithm|decision tree|shortest path|complexity)\b)/iu],
  ["physics", /(?:физик|ускорени|свободн паден|кинематик|закон[ау]? ома|сопротивлен|напряжен|маятник|колебани|теплопередач|идеальн|брос|\b(?:physics|projectile|kinematics|free fall|ohm|resistance|oscillator|ideal gas)\b)/iu],
  ["chemistry", /(?:хими|стехиометр|титрован|скорост реакци|\b(?:chemistry|titration|stoichiometry|reaction rate)\b)/iu],
  ["math", /(?:математ|график функц|производн|интеграл|корни уравнен|уравнен|регресс|корреляц|вероятност|\b(?:mathematics|function plot|derivative|integral|equation roots|regression|correlation|probability|y=)\b)/iu],
  ["statistics", /(?:статистик|доверительн интервал|сезонност|\b(?:statistics|confidence interval|seasonality)\b)/iu],
  ["general", /(?:перевод единиц|проверка гипотез|многодисциплинар|анализ данные|\b(?:unit conversion|evidence map|cross domain)\b)/iu],
]
const NO_PLOT = /(?:только\s+текст|без\s+(?:график|диаграмм|визуал|схем)|text\s+only|no\s+(?:charts?|visuals?|diagrams?))/iu

export function classifyAnalysisDomain(prompt: string): AnalysisDomain | null {
  const value = String(prompt || "").slice(0, 4000)
  if (/\b(?:oil painting|cooking oil|essential oil|motor oil)\b/iu.test(value) && !/нефт|скважин|мұнай|reservoir/iu.test(value)) return null
  return DOMAINS.find(([, pattern]) => pattern.test(value))?.[0] || null
}

/** Suggestions cannot execute formulas, fabricate data, or override user text-only intent. */
export function suggestAnalysisPresets(prompt: string, limit = 3): AnalysisPreset[] {
  const value = String(prompt || "").slice(0, 4000).toLocaleLowerCase()
  if (!value.trim() || NO_PLOT.test(value)) return []
  const domain = classifyAnalysisDomain(value)
  if (!domain) return []
  const scored = ANALYSIS_PRESETS
    .filter((item) => item.domain === domain)
    .map((item) => ({ item, score: item.keywords.reduce((score, word) => score + (value.includes(word.toLocaleLowerCase()) ? 1 : 0), 0) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)
  return scored.slice(0, Math.max(0, Math.min(3, Math.floor(limit)))).map(({ item }) => item)
}
