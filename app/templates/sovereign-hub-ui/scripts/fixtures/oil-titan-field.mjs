// Owner-supplied synthetic engineering benchmark; never field measurements.
export const records = [
  ['W-01','Jan',320,60,220000,2950], ['W-01','Apr',288,88,218000,2850], ['W-01','Jul',250,125,207500,2700], ['W-01','Oct',210,150,202000,2560],
  ['W-02','Jan',260,95,165000,2850], ['W-02','Apr',238,105,162000,2770], ['W-02','Jul',205,140,160000,2620], ['W-02','Oct',176,181,156000,2480],
  ['W-03','Jan',180,20,91000,3010], ['W-03','Apr',170,30,100000,2950], ['W-03','Jul',165,45,150000,2870], ['W-03','Oct',156,70,220000,2790],
  ['W-04','Jan',140,140,75000,2700], ['W-04','Apr',135,145,77000,2640], ['W-04','Jul',129,171,76000,2530], ['W-04','Oct',117,213,72500,2410],
]
export const declarations = 'Synthetic TITAN FIELD. History year: 2026.\nOil — bbl/day\nWater — bbl/day\nGas — scf/day\nPressure — psia'
export const table = ['Well\tMonth\tOil\tWater\tGas\tPressure', ...records.map(row => row.join('\t'))].join('\n')
export const question = 'Проанализируй TITAN FIELD. Рассчитай добычу нефти, воды и газа за все периоды, Water Cut, WOR, GOR, изменение давления, падение нефтяного дебита. Выполни DCA по каждой скважине и месторождению, дай прогноз на январь и апрель 2027 года. Построй таблицы и научные графики. Отдели гипотезы от фактов. Экономику без данных не придумывай. Укажи реально исполненные алгоритмы и модели.'
export const prompt = question + '\n\n' + declarations + '\n\n' + table
// Published mission values, not calculated by the implementation under test.
export const golden = {
  oil: [900,831,749,659], water: [315,368,481,614], gas: [551000,557000,593500,650500],
  pressure: [2877.5,2802.5,2680,2560],
  field: { D: 0.0346301499, qi: 910.922155, r2Log: 0.989330, january: 601.180754, april: 541.858661 },
  wells: {
    'W-01': { D: 0.046838, r2Log: 0.988084, january: 185.616, april: 161.283 },
    'W-02': { D: 0.043995, r2Log: 0.986483, january: 156.280, april: 136.956 },
    'W-03': { D: 0.015305, r2Log: 0.986558, january: 149.359, april: 142.656 },
    'W-04': { D: 0.019462, r2Log: 0.942946, january: 112.310, april: 105.940 },
  },
  summedForecast: { january: 603.563540, april: 546.835619 },
}
