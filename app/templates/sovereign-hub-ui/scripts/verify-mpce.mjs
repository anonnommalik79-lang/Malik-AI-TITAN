import test from 'node:test'
import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
import {workTestLoader} from './work-test-loader.mjs'
import {records,prompt,table,declarations,golden} from './fixtures/oil-titan-field.mjs'
const load=workTestLoader({'./oil-report.css':{}})
const {parseProductionTable,readPressureUnit}=load('lib/work/petroleum/table-input.ts')
const {analyzePetroleumDataset,fitDeclineModels}=load('lib/work/petroleum/analysis.ts')
const {verifyOilAnalysis}=load('lib/work/petroleum/verify-analysis.ts')
const {executeMpce}=load('lib/work/petroleum/mpce.ts')
const {screenProductionRisk,RISK_POLICY}=load('lib/work/petroleum/risk.ts')
const {arpsRate,effectiveDecline,fitHyperbolic}=load('lib/work/petroleum/dca.ts')
const {convertPressure,convert,waterCut,gasOilRatio}=load('lib/work/petroleum/units.ts')
const {petroleumAnalysisRequestSchema,petroleumAnalysisResultSchema}=load('lib/work/petroleum/analysis-contract.ts')
const {executePetroleumTable}=load('lib/work/petroleum/table-message.ts')
const {oilReportFence,readOilReportBlock,oilReportText}=load('lib/work/petroleum/visual-report.ts')
const {OIL_CAPABILITIES,invokeOilCapability,oilCapabilityCounts}=load('lib/work/petroleum/capability-catalog.ts')
const {finalizeAccuracy}=load('lib/ai/accuracy/engine.ts')
const {routePetroleum}=load('lib/work/petroleum/router.ts')
const {oilConclusion}=load('lib/work/petroleum/analysis-i18n.ts')
const {oilEvidenceLedger}=load('lib/work/petroleum/evidence-ledger.ts')
const {volumetricOil}=load('lib/work/petroleum/volumetric.ts')
const reservoir={areaM2:1e6,netPayM:20,porosity:.2,waterSaturation:.3,oilFormationVolumeFactor:1.2,basis:'homogeneous-volumetric-scenario',dataKind:'synthetic'}
const close=(a,b,t=1e-8)=>assert.ok(a!==null&&Number.isFinite(a)&&Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`)
const parsed=(text=prompt)=>{const p=parseProductionTable(text);assert.equal(p?.kind,'ok',JSON.stringify(p));return p.request}
const request=parsed(),result=analyzePetroleumDataset(request),mpce=executeMpce(request)
const exp=w=>w.models.find(f=>f.model==='exponential')
test('TITAN: strict schema and independent numerical validation PASS',()=>{assert.ok(petroleumAnalysisResultSchema.safeParse(result).success);assert.ok(mpce.validation.ok,mpce.validation.mismatches.join(','));assert.equal(result.sourceSummary.rows,16)})
// Point-by-point independently supplied values and identities (not implementation predictions).
for(const r of records) test(`TITAN raw point ${r[0]} ${r[1]}: oil/water/gas/WC/WOR/GOR/pressure`,()=>{
 const w=result.wells.find(w=>w.id===r[0]),i=w.period.indexOf(r[1]);assert.ok(i>=0)
 close(w.oil[i],r[2]);close(w.water[i],r[3]);close(w.gas[i],r[4]);close(w.liquid[i],r[2]+r[3]);close(w.wc[i],r[3]/(r[2]+r[3]));close(w.wor[i],r[3]/r[2]);close(w.gor[i],r[4]/r[2]);close(result.chartSeries.find(c=>c.well===w.id&&c.id==='pressure').series[0].values[i],r[5])
})
for(let i=0;i<4;i++)test(`TITAN field ${i}: golden sums and pressure mean`,()=>{
 const w=result.wells[0];close(w.oil[i],golden.oil[i]);close(w.water[i],golden.water[i]);close(w.gas[i],golden.gas[i]);close(w.liquid[i],golden.oil[i]+golden.water[i]);close(w.wc[i],golden.water[i]/(golden.oil[i]+golden.water[i]));close(w.gor[i],golden.gas[i]/golden.oil[i]);close(result.chartSeries.find(c=>c.id==='pressure'&&c.well==='__field__').series[0].values[i],golden.pressure[i])
})
for(const w of result.wells) {
 const ref=w.isField?golden.field:golden.wells[w.id]
 for(const key of ['D','r2Log','january','april'])test(`TITAN ${w.id}: independent published ${key}`,()=>{const actual=key==='D'?exp(w).D:key==='r2Log'?exp(w).r2Log:w.forecast.exponential[key==='january'?0:1];close(actual,ref[key],w.isField?2e-7:1e-5)})
 test(`TITAN ${w.id}: OLS independent pairwise covariance, qi fitted vs measured`,()=>{
  const x=w.t.map(t=>t-w.t[0]),y=w.oil.map(Math.log),n=x.length
  let xx=0,xy=0;for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){xx+=(x[a]-x[b])**2;xy+=(x[a]-x[b])*(y[a]-y[b])}
  const D=-xy/xx,qi=Math.exp(y.reduce((s,v,i)=>s+v+D*x[i],0)/n)
  close(exp(w).D,D);close(exp(w).qi,qi);assert.notEqual(exp(w).qi,w.oil[0])
  assert.deepEqual(w.forecast.t,[2027*12,2027*12+3]);close(w.forecast.exponential[0],qi*Math.exp(-D*12));close(w.forecast.exponential[1],qi*Math.exp(-D*15))
 })
}
test('TITAN: sum-of-well fits distinguished from field aggregate fit',()=>{const t=result.tableDatasets.find(t=>t.id==='summed-well-forecast');close(t.rows[0][1],golden.summedForecast.january);close(t.rows[1][1],golden.summedForecast.april);assert.ok(Math.abs(t.rows[0][1]-result.wells[0].forecast.exponential[0])>2)})
test('TITAN: all reported first/last benchmark values and decline',()=>{const w=result.wells[0];close(w.first.wc*100,25.925926,1e-7);close(w.last.wc*100,48.232522,1e-7);close(w.decline.total*100,26.777778,1e-7);close(w.change.liquid*100,4.773663,1e-7);close(result.calculatedMetrics.find(m=>m.well==='__field__'&&m.id==='pressure_change_abs').value,-317.5);close(result.wells.find(w=>w.id==='W-03').last.gor,1410.256410,1e-7);close(result.wells.find(w=>w.id==='W-04').last.wc*100,64.545455,1e-7)})
for(const sep of ['—','–','=',':','in'])test(`parser pressure declaration separator ${sep}`,()=>{const p=parsed(prompt.replace('Pressure — psia',`Pressure ${sep} psia`));assert.equal(p.units.pressure.datum,'absolute');assert.ok(p.dataset.wells.every(w=>w.pressure))})
for(const [unit,factor] of [['psi',1],['psia',1],['psig',1],['bar',100000/6894.757293168],['MPa',1000000/6894.757293168],['kPa',1000/6894.757293168]])test(`unit pressure parsing and scale ${unit}`,()=>{close(readPressureUnit(unit).factor,factor);const p=parsed(prompt.replace('Pressure — psia',`Pressure — ${unit}`));close(p.dataset.wells[0].pressure[0],2950*factor)})
test('unit psia survives table, graph, calculated metrics and limitations',()=>{assert.equal(result.validatedInputs.units.pressure,'psia');assert.ok(result.chartSeries.filter(c=>c.id==='pressure').every(c=>c.unit==='psia'));assert.ok(result.tableDatasets.filter(t=>t.id==='pressure').every(t=>t.columns[1].unit==='psia'));assert.ok(!result.limitations.includes('PRESSURE_DATUM_NOT_STATED'))})
test('pressure absolute/gauge conflict fails closed',()=>{const p=parseProductionTable(prompt.replace('Pressure\n','Pressure (psig)\n'));assert.equal(p.kind,'needs-input');assert.equal(p.code,'UNIT_CONFLICT')})
test('pressure conversion requires supplied ambient pressure',()=>{assert.throws(()=>convertPressure(100,'psig','psia'),/AMBIENT/);close(convertPressure(100,'psig','psia',{ambientPa:101325}),114.6959487755);assert.throws(()=>convertPressure(100,'psi','psia'),/DATUM/);close(convertPressure(100,'psig','bar',{toDatum:'gauge'}),6.894757293168)})
test('negative absolute pressure rejected; negative gauge retained correctly',()=>{assert.throws(()=>convertPressure(-1,'psia','psia'),/NEGATIVE/);close(convertPressure(-2,'psig','psia',{ambientPa:101325}),12.6959487755)})
for(const [from,to] of [['bbl/day','bbl'],['scf/day','bbl/day'],['psi','day'],['m3','scf'],['kg','m3']])test(`dimension mismatch ${from} -> ${to}`,()=>assert.throws(()=>convert(1,from,to,'T=15 C P=101325 Pa'),/DIMENSION/))
test('gas standard conversion requires physical reference',()=>{assert.throws(()=>convert(1,'scf','sm3'),/reference/);close(convert(1,'scf','sm3','same supplied T/P'),.028316846592)})
test('rate vs volume basis not guessed',()=>{assert.equal(parseProductionTable(prompt.replace('Oil — bbl/day','Oil — bbl')).kind,'needs-input')})
test('no density supplied: mass-to-volume oil refused',()=>{assert.equal(parseProductionTable(prompt.replace('Oil — bbl/day','Oil — t/day')).kind,'needs-input')})
test('no PVT supplied: reservoir volume refused',()=>{assert.equal(parseProductionTable(prompt.replace('Oil — bbl/day','Oil — reservoir bbl/day')).kind,'needs-input')})
test('gas unspecified standard conditions not silently converted',()=>{const p=parsed(prompt.replace('Gas — scf/day','Gas — m3/day'));assert.equal(p.units.gas,null);assert.ok(p.metadata.notes.includes('GAS_GAS_CONDITIONS_REQUIRED'))})
for(const lang of ['ru','en','kk','ar'])test(`multilingual ${lang}: units/metrics unchanged`,()=>{const r=structuredClone(request);r.language=lang;const report=analyzePetroleumDataset(r);assert.deepEqual(report.wells,result.wells);const view=readOilReportBlock(oilReportFence(r).split('\n')[1]);assert.ok(view);assert.ok(oilReportText(view).length>1000);assert.equal(view.crossCheck.status,'passed')})
test('yearless history must not infer calendar from requested forecast year',()=>{const p=parsed(prompt.replace('History year: 2026.',''));assert.equal(p.dataset.calendar,false);assert.equal(p.parameters.forecastTargets,undefined);assert.ok(p.metadata.notes.includes('FORECAST_YEAR_UNRESOLVED'))})
test('conflicting history years fail closed',()=>{assert.equal(parseProductionTable(prompt+'\nHistory year: 2025').code,'HISTORY_YEAR_CONFLICT')})
test('forecast maximum 24 months enforced',()=>{assert.equal(parseProductionTable(prompt.replace('2027 года','2030 года')).code,'FORECAST_TARGET_OUT_OF_RANGE')})
test('dates in headers respected without history-year metadata',()=>{const p=parsed(prompt.replace('History year: 2026.','').replace(/\t(Jan|Apr|Jul|Oct)\t/g,(_,m)=>'\t'+({Jan:'2026-01',Apr:'2026-04',Jul:'2026-07',Oct:'2026-10'}[m])+'\t'));assert.equal(p.dataset.calendar,true);assert.deepEqual(p.parameters.forecastTargets,[24324,24327])})
for(const b of [0,.15,.5,.85,1])for(const t of [0,3,12])test(`Arps analytical family b=${b} t=${t}: independent rate and effective decline`,()=>{const ref=b===0?500*Math.exp(-.04*t):500/(1+b*.04*t)**(1/b);close(arpsRate(500,.04,t,b),ref);close(effectiveDecline(.04,t,b),1-ref/500)})
for(const b of [0,.2,.5,.9,1])test(`hyperbolic fitting exact independent synthetic reference b=${b}`,()=>{const t=[0,1,3,5,8,12,18],q=t.map(t=>b===0?800*Math.exp(-.07*t):800/(1+b*.07*t)**(1/b)),fit=fitHyperbolic(t,q);assert.ok(fit);close(fit.qi,800,2e-5);close(fit.D,.07,2e-5);close(fit.b,b,2e-4)})
for(const [name,t,q] of [['too few',[0,1],[100,90]],['duplicate time',[0,1,1,2],[100,90,80,70]],['unordered',[0,2,1],[100,90,80]],['NaN',[0,1,2],[100,NaN,80]],['infinity',[0,1,2],[100,Infinity,80]],['negative',[0,1,2],[100,-1,80]],['mismatched',[0,1,2],[100,90]]])test(`DCA invalid series ${name}`,()=>assert.ok(fitDeclineModels(t,q).every(f=>!f.valid)))
test('zero oil safely null GOR/WOR; shut-in does not get log fit',()=>{const r=structuredClone(request);r.dataset.wells[0].oil[2]=0;const out=analyzePetroleumDataset(r);assert.equal(out.wells.find(w=>w.id==='W-01').gor[2],null);assert.equal(out.wells.find(w=>w.id==='W-01').models.find(f=>f.model==='exponential').valid,false)})
test('hyperbolic computation bounded independently of input length',()=>assert.equal(fitHyperbolic(Array.from({length:513},(_,i)=>i),Array.from({length:513},(_,i)=>100*Math.exp(-.001*i))),null))
const mutations={
 forecast:r=>{r.wells[0].forecast.exponential[0]+=5},
 coefficient:r=>{r.wells[0].models.find(f=>f.model==='exponential').D+=.01},
 r2Log:r=>{r.wells[0].models.find(f=>f.model==='exponential').r2Log=.9},
 wc:r=>{r.wells[0].wc[0]=.99},
 gor:r=>{r.wells[0].gor[0]=99},
 chart:r=>{r.chartSeries.find(c=>c.id==='rates').series[0].values[0]+=2},
 pressure:r=>{r.chartSeries.find(c=>c.id==='pressure'&&c.well==='__field__').series[0].values[0]+=20},
 table:r=>{r.tableDatasets.find(t=>t.id==='production').rows[0][1]=999},
 metric:r=>{r.calculatedMetrics.find(m=>m.id==='forecast_exponential_1').value=123},
 nonfinite:r=>{r.chartSeries[0].series[0].values[0]=Infinity},
}
for(const [name,mutate] of Object.entries(mutations))test(`independent validator detects tampered ${name}`,()=>{const r=structuredClone(result);mutate(r);assert.equal(verifyOilAnalysis(request,r).ok,false)})
test('execution receipt real functions, schema/time inputs and zero actual model calls',()=>{assert.equal(mpce.receipt.codeExecuted,true);assert.deepEqual(mpce.receipt.modelCalls,[]);assert.match(mpce.receipt.inputHash,/^[a-f0-9]{64}$/);assert.equal(mpce.receipt.validation.status,'passed');assert.ok(mpce.receipt.validation.checked>500);assert.equal(mpce.receipt.functions.length,3)})
test('unknown executable instructions prohibited by schema',()=>{assert.equal(petroleumAnalysisRequestSchema.safeParse({...request,code:'require(fs).readFileSync(.env)'}).success,false)})
test('report rejects invented ensemble provenance',()=>{const block=JSON.parse(oilReportFence(request,result,mpce.receipt).split('\n')[1]);block.execution.modelCalls=[{model:'imaginary'}];assert.equal(readOilReportBlock(JSON.stringify(block)),null)})
test('report drops contradictory execution metadata',()=>{const block=JSON.parse(oilReportFence(request,result,mpce.receipt).split('\n')[1]);block.execution.parameters.timeUnit='day';const view=readOilReportBlock(JSON.stringify(block));assert.equal(view.execution,undefined);assert.ok(view.tampered.includes('execution:receipt-mismatch'))})
test('risk one normalized dataset, explainable components and published weights',()=>{const risks=screenProductionRisk(request,result);for(const r of risks){assert.equal(r.dataQuality,'complete');assert.equal(r.components.length,4);close(r.index,r.components.reduce((s,c)=>s+Math.min(1,Math.max(0,c.value/c.scale))*c.weight*100,0));assert.equal(r.category,r.index>=65?'high':r.index>=35?'medium':'low')}close(Object.values(RISK_POLICY.weights).reduce((s,v)=>s+v,0),1)})
test('risk missing pressure stays unknown, not reassuring zero',()=>{const r=structuredClone(request);r.dataset.wells.forEach(w=>w.pressure=null);const risks=screenProductionRisk(r,analyzePetroleumDataset(r));assert.ok(risks.every(r=>r.index===null&&r.category==='unknown'))})
test('W-03 observed gas growth never called decline or proven gas coning',()=>{const lines=oilConclusion(result,result.wells.find(w=>w.id==='W-03'),'ru').join('\n');assert.ok(!lines.includes('газ снижается'));assert.match(lines,/Причина.*не установлена/);assert.equal(result.economicOutputs,null)})
test('science fallback produces one bounded diagnostic and preserves supplied/proved values',()=>{const out=finalizeAccuracy('Площадь крыла 12 м².\nВысота полёта 30 км.\nМасса 300 кг.\n2 * 3 = 6\nДано: масса 200 кг.','Научно объясни полет единорога. Масса 200 кг.');assert.ok(!out.content.includes('12 м²'));assert.ok(!out.content.includes('30 км'));assert.match(out.content,/2 \* 3 = 6/);assert.match(out.content,/200 кг/);assert.equal(out.content.split('Неподтверждённые').length-1,1);assert.equal(out.report.repairCalls,0)})
test('science table shape retained when unsupported numerical quantities withheld',()=>{const out=finalizeAccuracy('| Параметр | Значение |\n|---|---|\n| Масса | 400 кг |\n| Крыло | 20 м² |','Научно объясни полет единорога');assert.match(out.content,/\| Масса \| — \|/);assert.match(out.content,/\| Крыло \| — \|/)})
for(const p of ['Проанализируй нефть и нарисуй научный график','Explain unicorn flight without image','Сравни рост газа и падение нефти','Вычисли GOR по данным'])test(`routing no accidental media: ${p}`,()=>assert.ok(!['image','video','music'].includes(routePetroleum(p).engine)))
for(const variant of ['NaN','Infinity','-10','oops'])test(`parser corrupt oil ${variant}: precise issue without fabricated cell`,()=>{const p=parsed(prompt.replace('320\t60',variant+'\t60'));assert.ok(p.metadata.rejectedRows>0);assert.ok(!p.dataset.wells[0].oil.includes(320))})
test('zero denominator identities remain unknown, not NaN',()=>{assert.equal(waterCut({value:0,unit:'bbl/day'},{value:0,unit:'bbl/day'}),null);assert.equal(gasOilRatio({value:0,unit:'bbl/day'},{value:100,unit:'scf/day',reference:'source supplied'}),null)})
test('catalogue 100 capabilities: enabled entries all callable with references/tests/errors',()=>{assert.equal(OIL_CAPABILITIES.length,100);assert.equal(new Set(OIL_CAPABILITIES.map(c=>c.id)).size,100);assert.equal(Object.values(oilCapabilityCounts()).reduce((s,v)=>s+v,0),100);for(const c of OIL_CAPABILITIES.filter(c=>c.callable)){assert.ok(c.tests.length&&c.references.length&&c.equation&&c.inputSchema&&c.outputSchema&&c.errors.length);const input=c.id==='C21'?reservoir:c.group==='J'&&c.id!=='J100'?c.id==='J96'||c.id==='J97'?{op:'npv',cashflows:[-100,120],rate:.1,period:'year',currency:'USD'}:{op:'economics',input:{volumes:[100,95],price:70,variableOpex:20,fixedOpex:100,capex:1000,discountRate:.1,period:'year',currency:'USD'}}:request;assert.ok(invokeOilCapability(c.id,input))}})
test('catalogue unavailable advanced science never executes fabricated fallback',()=>{for(const id of ['B14','C22','E43','F51','G61','H72','I84','J99'])assert.throws(()=>invokeOilCapability(id,request),/NOT_IMPLEMENTED/)})
test('actual chat table entry returns one real receipt fence and no generic fallback',()=>{const answer=executePetroleumTable({prompt});assert.ok(answer.ok);assert.equal((answer.content.match(/```malik-oil-report/g)||[]).length,1);const view=readOilReportBlock(answer.content.split('\n')[1]);assert.ok(view.execution);assert.equal(view.crossCheck.status,'passed');const text=oilReportText(view);assert.match(text,/2027/);assert.match(text,/psia/);assert.match(text,/AI model calls: 0/);assert.ok(!text.includes('точное значение не установлено'))})
test('performance bounded 100 wells x 18 monthly points, no I/O/model calls',()=>{const r=structuredClone(request);r.parameters.forecastTargets=undefined;r.dataset.wells=Array.from({length:100},(_,i)=>({id:'SYN-'+i,t:Array.from({length:18},(_,t)=>24300+t),period:Array.from({length:18},(_,t)=>String(t)),oil:Array.from({length:18},(_,t)=>(100+i)*Math.exp(-.03*t)),water:Array.from({length:18},(_,t)=>20+t),gas:Array.from({length:18},()=>50000),pressure:Array.from({length:18},(_,t)=>3000-t*10)}));r.metadata.acceptedRows=1800;const start=performance.now(),out=executeMpce(r);assert.ok(out.validation.ok);assert.ok(performance.now()-start<5000);console.log('MPCE 100x18 ms:',(performance.now()-start).toFixed(1),'heap MB:',(process.memoryUsage().heapUsed/2**20).toFixed(1))})
test('reservoir demo: SI volumetric independent geometry identity, not reserves',()=>{const r=volumetricOil(reservoir);close(r.bulkVolumeM3,20000000);close(r.poreVolumeM3,4000000);close(r.hydrocarbonPoreVolumeM3,2800000);close(r.stockTankOilM3,2333333.3333333335);assert.equal(r.status,'MODELLED')})
for(const [key,value] of [['porosity',-1],['porosity',1.01],['waterSaturation',1],['oilFormationVolumeFactor',0],['areaM2',Infinity]])test(`reservoir invalid ${key}=${value}`,()=>assert.throws(()=>volumetricOil({...reservoir,[key]:value})))
test('evidence ledger synthetic data and hypothetical mechanism never verified measurements',()=>{const ledger=oilEvidenceLedger(request,result);assert.equal(ledger.find(c=>c.id==='input').status,'HYPOTHESIS');assert.equal(ledger.find(c=>c.id==='mechanism').status,'HYPOTHESIS');assert.equal(ledger.find(c=>c.id==='economics').status,'UNKNOWN');assert.ok(!ledger.some(c=>c.status==='VERIFIED'))})
test('sparse quarterly rates without averaging declaration are not cumulative volumes',()=>assert.equal(result.wells[0].cumulative,null))
test('explicit snapshot rates never integrate into calendar volumes',()=>{const p=parsed(prompt+'\nRate basis: snapshot');assert.equal(analyzePetroleumDataset(p).wells[0].cumulative,null)})
test('explicit calendar-average rates integrate only reported periods, not gaps',()=>{const p=parsed(prompt+'\nRate basis: calendar-average');close(analyzePetroleumDataset(p).wells[0].cumulative.oil,900*31+831*30+749*31+659*31)})
test('schema bounds aggregate points rather than only each well',()=>{const r=structuredClone(request);r.dataset.wells=Array.from({length:120},(_,i)=>({...r.dataset.wells[0],id:'W'+i,t:Array.from({length:42},(_,t)=>t),period:Array.from({length:42},(_,t)=>String(t)),oil:Array(42).fill(100),water:null,gas:null,pressure:null}));assert.equal(petroleumAnalysisRequestSchema.safeParse(r).success,false)})
test('schema refuses duplicate well identity before field double counting',()=>{const r=structuredClone(request);r.dataset.wells[1].id=r.dataset.wells[0].id;assert.equal(petroleumAnalysisRequestSchema.safeParse(r).success,false)})
test('reservoir typed task actually executable in the existing chat engine',()=>{const {executePetroleumMessage}=load('lib/work/petroleum/message.ts');const answer=executePetroleumMessage({prompt:'@Malik Oil AI Calculate OOIP\n```petroleum\n'+JSON.stringify({op:'volumetric-oil',input:reservoir})+'\n```'});assert.ok(answer.receipt.ok);close(answer.receipt.result.stockTankOilM3,2333333.3333333335);assert.match(answer.content,/N=A\*h\*phi/);assert.match(answer.content,/SHA-256/)})
