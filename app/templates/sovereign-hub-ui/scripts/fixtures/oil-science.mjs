// Synthetic numerical references. Never field observations, simulator validation or calibrated reserves.
import {advancedScienceCases} from './oil-science-advanced.mjs'
export const scienceCases=[
 {method:'linear-ipr',reservoirPa:20e6,testFlowingPa:15e6,testQM3Day:100,flowingPa:10e6,applicability:'single-phase-constant-PI',expected:{qM3Day:200,qMaxM3Day:400,piM3DayPa:.00002}},
 {method:'vogel',reservoirPa:20e6,bubblePointPa:21e6,testFlowingPa:10e6,testQM3Day:70,flowingPa:5e6,applicability:'saturated-solution-gas-drive',expected:{qMaxM3Day:100,qM3Day:90}},
 {method:'nodal',ipr:[{qM3Day:0,pPa:20e6},{qM3Day:100,pPa:10e6},{qM3Day:200,pPa:0}],vlp:[{qM3Day:0,pPa:5e6},{qM3Day:200,pPa:15e6}],pressureBasis:'same-absolute-node-pressure',rateBasis:'same-stock-tank-m3/day',expected:{qM3Day:100,nodePa:10e6}},
 {method:'giip',areaM2:1e6,netPayM:20,porosity:.2,waterSaturation:.25,bgReservoirPerStandard:.005,standardConditions:'101325 Pa absolute; 288.15 K',applicability:'homogeneous-dry-gas-volumetric',expected:{gasInitiallyInPlaceM3:600e6}},
 {method:'recovery-factor',producedM3:25e6,initialInPlaceM3:100e6,phase:'oil',volumeReference:'stock-tank m3; same conditions',expected:{recoveryFactor:.25}},
 {method:'darcy',permeabilityM2:1e-12,areaM2:100,deltaPa:1e6,viscosityPaS:.001,lengthM:100,applicability:'horizontal-single-phase-laminar-incompressible',expected:{qReservoirM3S:.001,qReservoirM3Day:86.4}},
 {method:'corey',swi:.2,sor:.2,krwEndpoint:.8,kroEndpoint:1,nw:2,no:2,expected:{mobileSaturationRange:.6}},
 {method:'capillary',entryPa:1000,lambda:2,effectiveSaturation:[.25,1],applicability:'Brooks-Corey-drainage',expected:{}},
 {method:'gas-bg',reservoirPa:10e6,reservoirK:300,z:1,standardPa:100000,standardK:300,standardZ:1,expected:{bgReservoirPerStandard:.01}},
 {method:'gas-z',pressurePa:100000,temperatureK:300,molarVolumeM3Mol:.02494338785445972,expected:{z:1}},
 {method:'gas-density',pressurePa:100000,temperatureK:300,z:1,molarMassKgMol:.016,expected:{densityKgM3:.6414525602278723}},
 {method:'oil-bo',reservoirOilM3:120,stockTankOilM3:100,parcelBasis:'same-reservoir-oil-parcel-after-separation',expected:{boReservoirPerStock:1.2}},
 {method:'archie',porosity:.2,waterResistivityOhmM:.1,formationResistivityOhmM:10,a:1,m:2,n:2,applicability:'clean-nonconductive-matrix',resistivityTemperatureBasis:'Rw/Rt both at reservoir temperature',expected:{waterSaturation:.5,formationFactor:25}},
 {method:'density-porosity',matrixKgM3:2650,bulkKgM3:2320,fluidKgM3:1000,shaleVolume:.1,shalePorosity:.2,applicability:'two-component-density-with-supplied-shale-correction',expected:{totalDensityPorosity:.2,effectivePorosity:.18}},
 {method:'gamma-ray',measuredAPI:70,cleanAPI:20,shaleAPI:120,applicability:'linear-local-endpoints',expected:{gammaRayIndex:.5,linearShaleVolume:.5}},
 {method:'net-pay',intervals:[{topM:100,baseM:110,porosity:.2,waterSaturation:.3,shaleVolume:.1},{topM:110,baseM:115,porosity:.05,waterSaturation:.3,shaleVolume:.1},{topM:120,baseM:125,porosity:null,waterSaturation:.3,shaleVolume:.1}],cutoffs:{minPorosity:.1,maxWaterSaturation:.6,maxShaleVolume:.3},depthBasis:'true-vertical-thickness',expected:{netPayM:10,coveredThicknessM:20,unclassifiedThicknessM:5,unloggedGapM:5,netToClassifiedGross:2/3}},
 {method:'hydrostatic',densityKgM3:1000,tvdM:2000,surfaceAbsolutePa:101325,expected:{deltaPa:19613300,bottomAbsolutePa:19714625}},
 {method:'ecd',mudDensityKgM3:1200,tvdM:1000,annularFrictionPa:1961330,expected:{ecdKgM3:1400}},
 {method:'pressure-window',poreAbsolutePa:9907975,fractureAbsolutePa:15791965,surfaceAbsolutePa:101325,tvdM:1000,lowerMarginPa:980665,upperMarginPa:980665,expected:{minDensityKgM3:1100,maxDensityKgM3:1500}},
 {method:'mud-weight',hydrostaticDeltaPa:19613300,tvdM:2000,expected:{equivalentDensityKgM3:1000}},
 {method:'allocation',totalM3:600,weights:[{id:'W-1',weight:1},{id:'W-2',weight:2},{id:'W-3',weight:3}],phase:'oil',volumeReference:'stock tank m3; same reference',period:'2026-01',expected:{allocatedM3:600,balanceResidualM3:0}},
 {method:'water-cost',waterM3:1000,variableCostPerM3:2.5,fixedCost:100,currency:'USD',period:'2026-01',expected:{variableCost:2500,totalCost:2600}},
 {method:'decline-backtest',history:[64,32,16,8,4,2].map((qM3Day,tDays)=>({tDays,qM3Day})),holdout:2,applicability:'positive-rate-exponential-log-OLS',expected:{nominalDeclinePerDay:.6931471805599453,fittedInitialM3Day:64,rmseM3Day:0,mapeFraction:0,trainCount:4,holdoutCount:2}},
 ...advancedScienceCases,
]
export const scienceInput=example=>{const {expected,...input}=example;return{dataKind:'synthetic',...structuredClone(input)}}
