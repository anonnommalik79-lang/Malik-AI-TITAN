import {z} from "zod"
import {advancedScienceSchemas} from "./science-advanced-schema"

// SI is part of every key, not inferred from prose. All operations are local, read-only and bounded.
const nonnegative=z.number().finite().min(0).max(1e15)
const positive=z.number().finite().min(1e-12).max(1e15)
const zeroOrPositive=z.union([z.literal(0),positive])
const fraction=z.number().finite().min(0).max(1)
const common={dataKind:z.enum(["user","synthetic"])}
const curve=z.array(z.object({qM3Day:nonnegative,pPa:nonnegative}).strict()).min(2).max(120)
const series=z.array(z.object({tDays:nonnegative,qM3Day:positive}).strict()).min(6).max(240)
export const scienceInputSchema=z.discriminatedUnion("method",[
  ...advancedScienceSchemas,
  z.object({...common,method:z.literal("linear-ipr"),reservoirPa:positive,testFlowingPa:nonnegative,testQM3Day:positive,flowingPa:nonnegative,applicability:z.literal("single-phase-constant-PI")}).strict(),
  z.object({...common,method:z.literal("vogel"),reservoirPa:positive,bubblePointPa:positive,testFlowingPa:nonnegative,testQM3Day:positive,flowingPa:nonnegative,applicability:z.literal("saturated-solution-gas-drive")}).strict(),
  z.object({...common,method:z.literal("nodal"),ipr:curve,vlp:curve,pressureBasis:z.literal("same-absolute-node-pressure"),rateBasis:z.literal("same-stock-tank-m3/day")}).strict(),
  z.object({...common,method:z.literal("giip"),areaM2:positive,netPayM:positive,porosity:fraction,waterSaturation:fraction,bgReservoirPerStandard:positive,standardConditions:z.string().min(5).max(160),applicability:z.literal("homogeneous-dry-gas-volumetric")}).strict(),
  z.object({...common,method:z.literal("recovery-factor"),producedM3:nonnegative,initialInPlaceM3:positive,phase:z.enum(["oil","gas"]),volumeReference:z.string().min(5).max(160)}).strict(),
  z.object({...common,method:z.literal("darcy"),permeabilityM2:positive,areaM2:positive,deltaPa:nonnegative,viscosityPaS:positive,lengthM:positive,applicability:z.literal("horizontal-single-phase-laminar-incompressible")}).strict(),
  z.object({...common,method:z.literal("corey"),swi:fraction,sor:fraction,krwEndpoint:fraction,kroEndpoint:fraction,nw:z.number().finite().min(1).max(20),no:z.number().finite().min(1).max(20)}).strict(),
  z.object({...common,method:z.literal("capillary"),entryPa:positive,lambda:z.number().finite().min(.1).max(20),effectiveSaturation:z.array(z.number().finite().min(1e-6).max(1)).min(1).max(120),applicability:z.literal("Brooks-Corey-drainage")}).strict(),
  z.object({...common,method:z.literal("gas-bg"),reservoirPa:positive,reservoirK:positive,z:positive,standardPa:positive,standardK:positive,standardZ:positive}).strict(),
  z.object({...common,method:z.literal("gas-z"),pressurePa:positive,temperatureK:positive,molarVolumeM3Mol:positive}).strict(),
  z.object({...common,method:z.literal("gas-density"),pressurePa:positive,temperatureK:positive,z:positive,molarMassKgMol:positive}).strict(),
  z.object({...common,method:z.literal("oil-bo"),reservoirOilM3:positive,stockTankOilM3:positive,parcelBasis:z.literal("same-reservoir-oil-parcel-after-separation")}).strict(),
  z.object({...common,method:z.literal("archie"),porosity:positive.max(1),waterResistivityOhmM:positive,formationResistivityOhmM:positive,a:positive,m:z.number().finite().min(.1).max(10),n:z.number().finite().min(.1).max(10),applicability:z.literal("clean-nonconductive-matrix"),resistivityTemperatureBasis:z.string().min(5).max(160)}).strict(),
  z.object({...common,method:z.literal("density-porosity"),matrixKgM3:positive,bulkKgM3:positive,fluidKgM3:positive,shaleVolume:fraction,shalePorosity:fraction,applicability:z.literal("two-component-density-with-supplied-shale-correction")}).strict(),
  z.object({...common,method:z.literal("gamma-ray"),measuredAPI:nonnegative,cleanAPI:nonnegative,shaleAPI:positive,applicability:z.literal("linear-local-endpoints")}).strict(),
  z.object({...common,method:z.literal("net-pay"),intervals:z.array(z.object({topM:nonnegative,baseM:positive,porosity:fraction.nullable(),waterSaturation:fraction.nullable(),shaleVolume:fraction.nullable()}).strict()).min(1).max(120),cutoffs:z.object({minPorosity:fraction,maxWaterSaturation:fraction,maxShaleVolume:fraction}).strict(),depthBasis:z.literal("true-vertical-thickness")}).strict(),
  z.object({...common,method:z.literal("hydrostatic"),densityKgM3:positive,tvdM:nonnegative,surfaceAbsolutePa:nonnegative}).strict(),
  z.object({...common,method:z.literal("ecd"),mudDensityKgM3:positive,tvdM:positive,annularFrictionPa:nonnegative}).strict(),
  z.object({...common,method:z.literal("pressure-window"),poreAbsolutePa:positive,fractureAbsolutePa:positive,surfaceAbsolutePa:nonnegative,tvdM:positive,lowerMarginPa:nonnegative,upperMarginPa:nonnegative}).strict(),
  z.object({...common,method:z.literal("mud-weight"),hydrostaticDeltaPa:positive,tvdM:positive}).strict(),
  z.object({...common,method:z.literal("allocation"),totalM3:nonnegative,weights:z.array(z.object({id:z.string().regex(/^[\p{L}\p{N}_ -]{1,48}$/u),weight:nonnegative}).strict()).min(1).max(120),phase:z.enum(["oil","gas","water"]),volumeReference:z.string().min(5).max(160),period:z.string().min(1).max(80)}).strict(),
  z.object({...common,method:z.literal("water-cost"),waterM3:zeroOrPositive,variableCostPerM3:zeroOrPositive,fixedCost:zeroOrPositive,currency:z.string().regex(/^[A-Z]{3}$/),period:z.string().min(1).max(80)}).strict(),
  z.object({...common,method:z.literal("decline-backtest"),history:series,holdout:z.number().int().min(2).max(60),applicability:z.literal("positive-rate-exponential-log-OLS")}).strict(),
])
export type ScienceInput=z.infer<typeof scienceInputSchema>
export type ScienceMethod=ScienceInput["method"]
const methodNames=scienceInputSchema.options.map(option=>option.shape.method.value) as [ScienceMethod,...ScienceMethod[]]
const outputNumber=z.number().finite().min(-1e100).max(1e100)
export const scienceResultSchema=z.object({
  kind:z.literal("mpce-science"),version:z.enum(["oil-science-1.0.0","oil-science-1.1.0"]),method:z.enum(methodNames),
  dataKind:z.enum(["user","synthetic"]),status:z.enum(["CALCULATED","MODELLED"]),
  metrics:z.record(z.string(),z.object({value:outputNumber.nullable(),unit:z.string().min(1).max(80)}).strict()),
  table:z.object({columns:z.array(z.object({key:z.string().min(1).max(80),unit:z.string().min(1).max(80)}).strict()).min(1).max(8),rows:z.array(z.array(outputNumber.or(z.string().max(160)).nullable()).min(1).max(8)).max(240)}).strict().optional(),
  curve:z.object({xLabel:z.string().max(40),xUnit:z.string().max(40),yLabel:z.string().max(40),yUnit:z.string().max(40),series:z.array(z.object({name:z.string().max(40),points:z.array(z.object({x:outputNumber,y:outputNumber}).strict()).min(1).max(120)}).strict()).min(1).max(3)}).strict().optional(),
  warnings:z.array(z.string().max(500)).max(30),
  execution:z.object({codeExecuted:z.literal(true),modelCalls:z.array(z.never()).max(0),durationMs:z.number().finite().min(0),validation:z.object({ok:z.literal(true),checked:z.number().int().positive()}).strict()}).strict(),
}).strict().superRefine((value,ctx)=>{
  if(value.table?.rows.some(row=>row.length!==value.table!.columns.length))ctx.addIssue({code:"custom",message:"TABLE_WIDTH_MISMATCH"})
})
export type ScienceResult=z.infer<typeof scienceResultSchema>
