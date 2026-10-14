import type { PetroleumAnalysisRequest, PetroleumAnalysisResult } from "./analysis-contract"

/** Independent raw-data identities, including yearless monthly tables. No fitted model is a measurement. */
export function verifyOilAnalysis(request: PetroleumAnalysisRequest, result: PetroleumAnalysisResult) {
  const mismatches: string[] = []
  let checked = 0
  const close = (id: string, actual: number | null, expected: number | null) => {
    checked++
    if (actual === null || expected === null ? actual !== expected : !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-9 * Math.max(1, Math.abs(expected))) mismatches.push(id)
  }
  for (const series of result.wells) for (let i = 0; i < series.t.length; i++) {
    const raw = request.dataset.wells.filter(w => series.isField || w.id === series.id)
    const points = raw.map(w => ({ w, at: w.t.indexOf(series.t[i]) }))
    if (points.some(p => p.at < 0)) { mismatches.push(`${series.id}:missing-source`); continue }
    const oil = points.reduce((sum, p) => sum + p.w.oil[p.at], 0)
    const sum = (key: "water" | "gas") => points.some(p => p.w[key]?.[p.at] === null || p.w[key]?.[p.at] === undefined) ? null : points.reduce((s, p) => s + p.w[key]![p.at]!, 0)
    const water = sum("water"), gas = sum("gas")
    const gorFactor = request.units.liquid === "t/day" ? 1 : request.units.gas === "scf/day" ? request.units.liquid === "bbl/day" ? 1 : 1 / 0.158987294928 : request.units.liquid === "m3/day" ? 1 : 0.158987294928
    close(`${series.id}:${i}:oil`, series.oil[i], oil)
    close(`${series.id}:${i}:water`, series.water[i], water)
    close(`${series.id}:${i}:gas`, series.gas[i], gas)
    close(`${series.id}:${i}:wc`, series.wc[i], water !== null && oil + water > 0 ? water / (oil + water) : null)
    close(`${series.id}:${i}:wor`, series.wor[i], water !== null && oil > 0 ? water / oil : null)
    close(`${series.id}:${i}:gor`, series.gor[i], gas !== null && oil > 0 ? gas / (oil * gorFactor) : null)
  }
  for (const chart of result.chartSeries) for (const series of chart.series) for (const value of series.values) {
    checked++
    if (value !== null && !Number.isFinite(value)) mismatches.push(`${chart.well}:${chart.id}:nonfinite`)
  }
  // Separate implementation of centred OLS and prediction equations: no calls
  // to analysis.ts / fitDeclineModels / predictModel, so errors cannot endorse
  // themselves. Log and rate residual spaces have distinct identities.
  for (const w of result.wells) {
    if(w.oil.some(v=>v===null||!Number.isFinite(v))){mismatches.push(`${w.id}:oil-domain`);continue}
    const x=w.t.map(t=>t-w.t[0]), q=w.oil as number[]
    const regression=(y:number[])=>{
      const mx=x.reduce((s,v)=>s+v,0)/x.length,my=y.reduce((s,v)=>s+v,0)/y.length
      const xx=x.reduce((s,v)=>s+(v-mx)*(v-mx),0)
      const slope=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/xx
      return {slope,intercept:my-slope*mx}
    }
    const score=(y:number[],p:number[])=>{
      const mean=y.reduce((s,v)=>s+v,0)/y.length
      const sst=y.reduce((s,v)=>s+(v-mean)**2,0),sse=y.reduce((s,v,i)=>s+(v-p[i])**2,0)
      return {r2:sst>0?1-sse/sst:null,rmse:Math.sqrt(sse/y.length)}
    }
    for(const fit of w.models) {
      if(!fit.valid) continue
      const formula=(t:number)=> fit.model==="linear" ? fit.a!+fit.b!*t : fit.model==="exponential" ? fit.qi!*Math.exp(-fit.D!*t) : fit.model==="harmonic" ? fit.qi!/(1+fit.D!*t) : (fit.arpsB??0)<1e-8 ? fit.qi!*Math.exp(-fit.D!*t) : fit.qi!*Math.pow(1+fit.arpsB!*fit.D!*t,-1/fit.arpsB!)
      const r=score(q,x.map(formula))
      close(`${w.id}:${fit.model}:r2-rate`,fit.r2,r.r2);close(`${w.id}:${fit.model}:rmse`,fit.rmse,r.rmse)
      if(fit.model==="linear") {
        const ref=regression(q);close(`${w.id}:linear:a`,fit.a,ref.intercept);close(`${w.id}:linear:b`,fit.b,ref.slope)
      } else {
        if(fit.model==="exponential") {
          const ref=regression(q.map(Math.log));close(`${w.id}:exponential:qi`,fit.qi,Math.exp(ref.intercept));close(`${w.id}:exponential:D`,fit.D,-ref.slope)
        }
        if(fit.model==="harmonic") {
          const ref=regression(q.map(v=>1/v));close(`${w.id}:harmonic:qi`,fit.qi,1/ref.intercept);close(`${w.id}:harmonic:D`,fit.D,ref.slope/ref.intercept)
        }
        if(!(fit.qi!>0)||!(fit.D!>0)||fit.model==="hyperbolic"&&!(fit.arpsB!>=0&&fit.arpsB!<=1)) mismatches.push(`${w.id}:${fit.model}:domain`)
        if(fit.r2Log!==undefined) close(`${w.id}:${fit.model}:r2-log`,fit.r2Log,score(q.map(Math.log),x.map(t=>Math.log(formula(t)))).r2)
      }
      if(w.forecast) w.forecast.t.forEach((t,i)=>{
        const expected=formula(t-w.t[0])
        close(`${w.id}:${fit.model}:forecast:${i}`,w.forecast![fit.model]?.[i]??null,fit.model==="linear"?Math.max(0,expected):expected)
      })
    }
    const metrics=result.calculatedMetrics.filter(m=>m.well===w.id)
    for(const m of metrics) {
      const reference:Record<string,number|null>={oil_first:w.oil[0],oil_last:w.oil[w.oil.length-1],wc_last:w.wc[w.wc.length-1],gor_last:w.gor[w.gor.length-1],wor_last:w.wor[w.wor.length-1],decline_total:q[0]>0?(q[0]-q[q.length-1])/q[0]:null}
      if(Object.hasOwn(reference,m.id)) close(`${w.id}:metric:${m.id}`,m.value,reference[m.id])
      const forecast=m.id.match(/^forecast_(linear|exponential|harmonic|hyperbolic)_(\d+)$/)
      if(forecast) close(`${w.id}:metric:${m.id}`,m.value,w.forecast?.[forecast[1] as "linear"]?.[Number(forecast[2])-1]??null)
    }
    const pressure=request.dataset.wells.filter(raw=>w.isField||raw.id===w.id)
    const meanPressure=w.t.map(t=>{
      const values=pressure.map(raw=>raw.pressure?.[raw.t.indexOf(t)]??null)
      return values.every(v=>v!==null)?values.reduce((s,v)=>s+v!,0)/values.length:null
    })
    const pressureChart=result.chartSeries.find(c=>c.well===w.id&&c.id==="pressure")?.series.find(s=>s.id==="pressure")
    if(pressureChart) meanPressure.forEach((v,i)=>close(`${w.id}:pressure:${i}`,pressureChart.values[i],v))
    for(const [id,v] of [["pressure_first",meanPressure[0]],["pressure_last",meanPressure[meanPressure.length-1]],["pressure_change_abs",meanPressure[0]!==null&&meanPressure[meanPressure.length-1]!==null?meanPressure[meanPressure.length-1]!-meanPressure[0]!:null]] as const) {
      const metric=metrics.find(m=>m.id===id);if(metric)close(`${w.id}:metric:${id}`,metric.value,v)
    }
    const table=result.tableDatasets.find(t=>t.well===w.id&&t.id==="production")
    table?.rows.forEach((row,i)=>[w.oil[i],w.water[i],w.gas[i],w.liquid[i],w.wc[i]===null?null:w.wc[i]!*100,w.gor[i],w.wor[i]].forEach((v,j)=>close(`${w.id}:table:${i}:${j}`,row[j+1] as number|null,v)))
    for(const chart of result.chartSeries.filter(c=>c.well===w.id&&c.id!=="pressure")) for(const s of chart.series) {
      const values:Record<string,Array<number|null>>={oil:w.oil,water:w.water,gas:w.gas,liquid:w.liquid,wc:w.wc.map(v=>v===null?null:v*100),wor:w.wor,gor:w.gor,worDerivative:w.worDerivative}
      if(chart.id!=="forecast"&&values[s.id]) s.values.forEach((v,i)=>close(`${w.id}:${chart.id}:${s.id}:${i}`,v,values[s.id][i]))
      if(chart.id==="forecast"&&s.role==="model") {
        const fit=w.models.find(f=>f.model===s.id)
        if(fit?.valid&&w.forecast) w.forecast.t.forEach((_,i)=>close(`${w.id}:chart-forecast:${s.id}:${i}`,s.values[w.t.length+i],w.forecast![fit.model]?.[i]??null))
      }
    }
  }
  return { ok: mismatches.length === 0, checked, mismatches }
}
