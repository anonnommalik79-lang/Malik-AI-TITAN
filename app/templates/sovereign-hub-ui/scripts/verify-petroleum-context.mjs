import test from 'node:test'
import assert from 'node:assert/strict'
import {workTestLoader} from './work-test-loader.mjs'
import {prompt,table,declarations} from './fixtures/oil-six-wells.mjs'
const load=workTestLoader({})
const {parseProductionTable}=load('lib/work/petroleum/table-input.ts')
const {analyzePetroleumDataset}=load('lib/work/petroleum/analysis.ts')
const close=(a,b)=>assert.ok(a!==null&&Math.abs(a-b)<1e-8,`${a} != ${b}`)
test('production regression: explicitly declared units trigger six-well calculations',()=>{
 const p=parseProductionTable(prompt);assert.equal(p?.kind,'ok')
 const r=analyzePetroleumDataset(p.request),f=r.wells.find(w=>w.isField)
 const rows=table.split('\n').slice(1).map(l=>l.split('\t'))
 const sum=(month,col)=>rows.filter(r=>r[1]===month).reduce((s,r)=>s+Number(r[col]),0)
 close(sum('Jan',2),4000);close(sum('Oct',2),3240)
 close(f.first.oil,sum('Jan',2));close(f.last.oil,sum('Oct',2))
 close(f.decline.total,0.19);close(f.first.water,1130);close(f.last.water,2070)
 close(f.first.wc,1130/(4000+1130));close(f.last.wc,2070/(3240+2070))
 close(r.wells.find(w=>w.id==='W-04').last.wc,700/1140)
 for(const w of r.wells)for(let i=0;i<w.t.length;i++){
  close(w.wc[i],w.water[i]/(w.oil[i]+w.water[i]));close(w.wor[i],w.water[i]/w.oil[i]);close(w.gor[i],w.gas[i]/w.oil[i])
 }
})
const {executePetroleumTable,OIL_EXECUTION_STAGES}=load('lib/work/petroleum/table-message.ts')
const {readOilReportBlock}=load('lib/work/petroleum/visual-report.ts')
const {verifyOilAnalysis}=load('lib/work/petroleum/verify-analysis.ts')
const {buildOilWaterCutHeatmap}=load('lib/visual/oil-heatmap.ts')
const {npv,irr,economics}=load('lib/work/petroleum/economics.ts')
const {decline,declineVolume}=load('lib/work/petroleum/reservoir.ts')
const rows=table.split('\n').slice(1).map(line=>line.split('\t'))
const headerTable=table.replace('Oil\tWater\tGas\tPwf','Oil (STB/day)\tWater (bbl/day at surface conditions)\tGas (standard scf/day)\tPwf (psi)')
const parsed=text=>{const p=parseProductionTable(text);assert.equal(p?.kind,'ok',JSON.stringify(p));return p.request}
const result=text=>analyzePetroleumDataset(parsed(text))
for(const [name,text] of [
 ['units in headers',headerTable], ['units before table',declarations+'\n'+table],
 ['units after table',table+'\n\n'+declarations],['Oil = STB/day',declarations+'\n'+table],
 ['Water = bbl/day',declarations+'\n'+table],['Gas = scf/day',declarations.replace('standard scf','scf')+'\n'+table],
 ['Pwf = psi',declarations+'\n'+table],
 ['Russian м³/сут',declarations.replace('Oil = STB/day','Нефть = м³/сут').replace('Water = bbl/day at surface conditions','Вода = м³/сут')+'\n'+table.replace('Oil\tWater','Нефть\tВода')],
 ['English m3/day',declarations.replace('STB/day','m3/day').replace('bbl/day','m3/day')+'\n'+table],
 ['mixed RU EN',declarations.replace('Water =','Вода =')+'\n'+table.replace('Water','Вода')],
 ['multi-line engineering instructions',declarations+'\n\nПроверяй отдельно все этапы.\nНе интерполируй данные.\n\n'+table],
 ['long prompt over 10000 characters','Analyze oil production.\n'+('Keep verified engineering inputs.\n'.repeat(400))+declarations+'\n'+table],
 ['spaces in units',declarations.replace(/=/g,'  =  ').replace(/\/day/g,' / day ')+'\n'+table],
 ['Markdown declarations and table','**Oil** = **STB/day**\n**Water** = `bbl/day at surface conditions`\n**Gas** = **standard scf/day**\nPwf = psi\n\n|'+table.split('\n').map(l=>l.replace(/\t/g,'|')).join('|\n|')+'|'],
 ['CSV data',declarations+'\n'+table.replace(/\t/g,',')],
 ['technical JSON',JSON.stringify({units:{Oil:'STB/day',Water:{unit:'bbl/day',conditions:'surface conditions'},Gas:'standard scf/day',Pwf:'psi'},rows:rows.map(r=>({Well:r[0],Month:r[1],Oil:+r[2],Water:+r[3],Gas:+r[4],Pwf:+r[5]}))})],
 ['role synonyms q_o q_w q_g',declarations.replace('Oil =','q_o =').replace('Water =','q_w =').replace('Gas =','q_g =')+'\n'+table.replace('Oil\tWater\tGas','q_o\tq_w\tq_g')],
 ['prose parenthetical before','Oil production (STB per day)\nWater production (bbl per day at surface conditions)\nGas production (standard scf per day)\nPwf = psi\n'+table],
 ['prose after',table+'\n\nOil production (STB per day)\nWater production (bbl per day at surface conditions)\nGas production (standard scf per day)\nPwf = psi'],
 ['superscript units',declarations.replace('STB/day','m<sup>3</sup>/day').replace('bbl/day','m³/day')+'\n'+table],
])test('units: '+name,()=>{const r=parsed(text);assert.equal(r.metadata.acceptedRows,24);assert.equal(r.dataset.wells.length,6);assert.ok(r.dataset.wells.every(w=>w.water&&w.gas&&w.pressure))})
test('units: all tables are included, not only the first',()=>{
 const lines=headerTable.split('\n'),split=lines.findIndex(l=>l.startsWith('W-04'))
 const r=parsed(lines.slice(0,split).join('\n')+'\n\nAnother production table:\n'+[lines[0],...lines.slice(split)].join('\n'))
 assert.equal(r.metadata.acceptedRows,24);close(analyzePetroleumDataset(r).wells[0].last.oil,3240)
})
test('units: conflict reports exact competing declarations',()=>{const p=parseProductionTable('Oil = m3/day\n'+headerTable);assert.equal(p.kind,'needs-input');assert.equal(p.code,'UNIT_CONFLICT');assert.deepEqual(p.columns,['Oil (STB/day)','Oil = m3/day'])})
test('units: absent oil units ask a precise question',()=>{const p=parseProductionTable(table);assert.equal(p.kind,'needs-input');assert.equal(p.code,'UNITS_MISSING');assert.ok(p.columns.includes('Oil'))})
test('units: partial declarations retain oil and water calculations',()=>{const p=parsed(declarations.replace('Gas = standard scf/day','')+'\n'+table);assert.equal(p.units.gas,null);const r=analyzePetroleumDataset(p);close(r.wells[0].last.oil,3240);close(r.wells[0].last.wc,2070/5310);assert.equal(r.wells[0].last.gor,null);assert.ok(p.metadata.notes.includes('GAS_UNITS_MISSING'))})
test('units: reservoir water cannot be added to stock tank oil',()=>{const r=parsed(declarations.replace('Water = bbl/day at surface conditions','Water = bbl/day at reservoir conditions')+'\n'+table);assert.equal(r.dataset.wells[0].water,null);assert.equal(analyzePetroleumDataset(r).wells[0].last.wc,null);assert.ok(r.metadata.notes.includes('WATER_RESERVOIR_CONVERSION_REQUIRED'))})
test('units: unspecified gas m3 conditions cannot silently become standard',()=>{const p=parsed(declarations.replace('standard scf/day','m3/day')+'\n'+table);assert.equal(p.units.gas,null);assert.equal(analyzePetroleumDataset(p).wells[0].last.gor,null)})
for(const [unit,factor] of [['Mscf/day',1000],['MMscf/day',1e6]])test('units: '+unit+' prefixes scale actual gas',()=>close(result(declarations.replace('standard scf/day',unit)+'\n'+table).wells.find(w=>w.id==='W-01').gas[0],270000*factor))
for(const [unit,factor] of [['psi',1],['bar',14.5037737730209],['kPa',0.145037737730209],['MPa',145.037737730209]])test('pressure: '+unit+' normalization and actual chart',()=>{
 const r=result(declarations.replace('Pwf = psi','Pwf = '+unit)+'\n'+table)
 const chart=r.chartSeries.find(c=>c.id==='pressure'&&c.well==='W-04');close(chart.series[0].values[3],232*factor)
 close(r.calculatedMetrics.find(m=>m.id==='pressure_change_abs'&&m.well==='W-04').value,-38*factor)
 const field=r.chartSeries.find(c=>c.id==='pressure'&&c.well==='__field__')
 assert.equal(field.series.length,7) // six measured traces plus explicitly calculated mean
 const expected=r.wells.filter(w=>!w.isField).reduce((s,w)=>s+r.chartSeries.find(c=>c.id==='pressure'&&c.well===w.id).series[0].values[3],0)/6
 close(field.series.find(s=>s.id==='pressure').values[3],expected)
})
test('engineering: missing measurements remain null and do not become zero',()=>{const p=parsed(declarations+'\n'+table.replace('900\t100','900\t'));assert.equal(p.dataset.wells[0].water[0],null);assert.equal(analyzePetroleumDataset(p).wells[0].first.wc,null)})
test('engineering: negative, NaN, Infinity and impossible values are rejected',()=>{for(const bad of ['-900','NaN','Infinity','100000000000000']){const p=parsed(declarations+'\n'+table.replace('900\t100',bad+'\t100'));assert.equal(p.metadata.acceptedRows,23);assert.ok(p.metadata.issues.length>0)}})
test('engineering: wrong physical dimension cannot be treated as oil',()=>assert.equal(parseProductionTable(declarations.replace('STB/day','scf/day')+'\n'+table).code,'OIL_UNIT_UNSUPPORTED'))
test('engineering: zero oil and zero liquid preserve undefined ratios',()=>{const r=result(declarations+'\n'+table.replace('900\t100','0\t0'));const w=r.wells.find(w=>w.id==='W-01');assert.equal(w.wc[0],null);assert.equal(w.wor[0],null);assert.equal(w.gor[0],null)})
test('engineering: zero water is a valid zero water cut',()=>close(result(declarations+'\n'+table.replace('900\t100','900\t0')).wells.find(w=>w.id==='W-01').wc[0],0))
test('engineering: field total is verified and never double counted',()=>{
 for(const oil of [4000,4001]){const r=parsed(declarations+'\n'+table+`\nTotal\tJan\t${oil}\t1130\t1180000\t0`);close(analyzePetroleumDataset(r).wells[0].first.oil,4000);assert.equal(r.dataset.wells.length,6);assert.equal(r.metadata.issues.some(i=>i.code==='AGGREGATE_TOTAL_MISMATCH'),oil!==4000)}
})
test('visual: Water Cut heatmap equals every raw source fraction',()=>{const r=result(prompt),heat=buildOilWaterCutHeatmap(r.wells);for(const w of heat.wells)for(let i=0;i<w.values.length;i++){const source=rows.find(row=>row[0]===w.id&&row[1]===heat.periods[i].label);close(w.values[i],100*Number(source[3])/(Number(source[2])+Number(source[3])))}close(heat.wells.find(w=>w.id==='W-04').values[3],100*700/1140)})
test('execution: real ordered events, deterministic receipt and tamper verification',()=>{const events=[];const answer=executePetroleumTable({prompt,onEvent:e=>events.push(e)});assert.equal(answer.ok,true);assert.deepEqual(events.map(e=>e.stage),OIL_EXECUTION_STAGES);assert.ok(events.every(e=>e.status==='completed'));const v=readOilReportBlock(answer.content.split('\n')[1]);assert.ok(verifyOilAnalysis(v.request,v.result).ok);v.result.wells[0].oil[0]++;assert.equal(verifyOilAnalysis(v.request,v.result).ok,false);assert.doesNotMatch(answer.content,/нет единиц/)})
test('execution: units failures expose blocked stage instead of fake progress',()=>{const answer=executePetroleumTable({prompt:'@Malik Oil AI Рассчитай добычу\n'+table});assert.equal(answer.ok,false);assert.equal(answer.events.at(-1).status,'blocked');assert.ok(!answer.events.some(e=>e.stage==='COMPUTATIONS_STARTED'))})
test('reproducibility: unit and parameter changes alter source hash',()=>{const a=executePetroleumTable({prompt}),b=executePetroleumTable({prompt:prompt.replace('STB/day','m3/day')});assert.notEqual(a.inputHash,b.inputHash);assert.equal(a.inputHash,executePetroleumTable({prompt}).inputHash)})
test('economics: independent DCF NPV, exact IRR, payback and sensitivity',()=>{
 close(npv([-1000,600,600],0.1),-1000+600/1.1+600/1.21)
 close(irr([-100,60,60]).rate,(60+Math.sqrt(27600))/200-1)
 const r=economics({volumes:[10,10,10],price:70,variableOpex:20,fixedOpex:0,capex:1000,discountRate:0.1,period:'year',currency:'USD'})
 assert.deepEqual(r.cashflows,[-1000,500,500,500]);close(r.paybackPeriods,2);assert.ok(r.sensitivity[0].npv<r.sensitivity[1].npv&&r.sensitivity[1].npv<r.sensitivity[2].npv);assert.ok(r.assumptions.length>0)
 assert.equal(irr([-100,230,-132]).rate,null);assert.throws(()=>npv([100,Infinity],0.1));assert.throws(()=>economics({volumes:[-1],price:70,variableOpex:20,fixedOpex:0,capex:1000,discountRate:0.1}))
})
test('decline: independent exponential, hyperbolic, cumulative and zero-decline limits',()=>{
 close(decline(100,0.01,100),100/Math.E);close(decline(100,0.01,100,0.5),100/1.5**2);close(declineVolume(100,0.01,0,30),100*(1-Math.exp(-0.3))/0.01);close(declineVolume(100,0,0,30),3000)
})
test('six wells: no supplied economics, reserves, risk probabilities or cumulative snapshots fabricated',()=>{const r=result(prompt);assert.equal(r.economicOutputs,null);assert.ok(r.wells.every(w=>w.cumulative===null));assert.equal(r.analysisSections.find(s=>s.id==='economics').status,'insufficient-data')})
const {runMalikOilEnsemble,validOilParticipantText}=load('lib/server/malik-oil-ensemble.ts')
const ensembleInput={modelId:'malik-oil-1tb',prompt,systemPrompt:'Use verified engine inputs',participantTimeoutMs:25}
const vote=req=>({content:'Engineering review with supplied petroleum inputs',provider:'fixture',model:req.modelId,selectedModelId:req.modelId,latencyMs:1})
test('ensemble: malformed JSON, quota envelopes and empty object cannot be votes',()=>{
 for(const bad of ['{}','[]','{bad JSON','{"status":"error","message":"quota"}','{"ok":false,"message":"payment required"}','Your quota has been exceeded','You have exceeded your rate limit'])assert.equal(validOilParticipantText(bad),'')
})
test('ensemble: a provider timeout produces honest 2/3 and one final answer',async()=>{const chunks=[];const r=await runMalikOilEnsemble({...ensembleInput,onToken:c=>chunks.push(c)},async req=>req.modelId==='nvidia-nemotron-ultra-550b'?new Promise(()=>{}):vote(req));assert.match(r.content,/2\/3/);assert.match(r.content,/PARTICIPANT_TIMEOUT/);assert.equal(chunks.length,1)})
test('ensemble: wrong selected identity is not an independent named vote',async()=>{const r=await runMalikOilEnsemble(ensembleInput,async req=>({...vote(req),selectedModelId:req.modelId==='ling-3.1-flash'?'malik-max':req.modelId}));assert.match(r.content,/2\/3/);assert.match(r.content,/INVALID_RESPONSE/)})
test('ensemble: all failures are explicit, no fake consensus',async()=>assert.rejects(()=>runMalikOilEnsemble(ensembleInput,async()=>{throw new Error('Fixture provider unavailable')}),e=>e.code==='OIL_ENSEMBLE_UNAVAILABLE'))

test('gas conditions: surface m3 is not automatically standard m3',()=>{const p=parsed(declarations.replace('standard scf/day','m3/day at surface conditions')+'\n'+table);assert.equal(p.units.gas,null);assert.equal(analyzePetroleumDataset(p).wells[0].last.gor,null)})
test('gas conditions: a metric prefix does not establish standard conditions',()=>{const p=parsed(declarations.replace('standard scf/day','тыс. м3/сут')+'\n'+table);assert.equal(p.units.gas,null);assert.ok(p.metadata.notes.includes('GAS_GAS_CONDITIONS_REQUIRED'))})
test('gas conditions: explicitly standard metric prefix retains measured gas',()=>{const p=parsed(declarations.replace('standard scf/day','тыс. ст. м3/сут')+'\n'+table);assert.equal(p.units.gas,'sm3/day');close(p.dataset.wells[0].gas[0],270000000)})

const {guardOilInterpretation}=load('lib/work/petroleum/interpretation-policy.ts')
test('economics policy: source incident profitability claim is withheld, participation retained',()=>{
 const r=guardOilInterpretation('* Экономика: При текущем темпе падения (24% в год) без ГТМ фонд станет нерентабельным в течение 18–24 месяцев (в зависимости от OPEX на утилизацию воды).\n\n### Проверка участия моделей (2/3)\n- NVIDIA: участвовала','ru');assert.equal(r.removed,1);assert.doesNotMatch(r.content,/18–24|нерентабельным/);assert.match(r.content,/2\/3/)
})
test('economics policy: valid data trends and missing-input explanations are preserved',()=>{
 const text='Oil fell 19%; W-04 water cut is 61.40%.\n\n8 months; NPV needs review.';assert.equal(guardOilInterpretation(text,'en').content,text)
})
test('economics policy: numerical ROI/NPV claims cannot become financial evidence',()=>{
 for(const text of ['NPV = $1000000','IRR 45%','Profitability in 18 months','Окупаемость: 2 года','Экономика: прибыль 5000 USD'])assert.equal(guardOilInterpretation(text,'en').removed,1)
})
