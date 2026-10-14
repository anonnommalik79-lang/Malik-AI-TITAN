import {z} from "zod"
/** Transparent SI volumetric model, NOT a calibrated reservoir simulator. */
export const volumetricSchema=z.object({
  areaM2:z.number().finite().positive().max(1e12),netPayM:z.number().finite().positive().max(1e4),
  porosity:z.number().finite().gt(0).lte(1),waterSaturation:z.number().finite().min(0).lt(1),
  oilFormationVolumeFactor:z.number().finite().positive().max(10),
  basis:z.literal("homogeneous-volumetric-scenario"),dataKind:z.enum(["synthetic","user"]),
}).strict()
export function volumetricOil(raw:unknown) {
  const p=volumetricSchema.parse(raw),bulk=p.areaM2*p.netPayM,pore=bulk*p.porosity,hcpv=pore*(1-p.waterSaturation)
  return {version:"mpce-volumetric-1.0.0",bulkVolumeM3:bulk,poreVolumeM3:pore,hydrocarbonPoreVolumeM3:hcpv,stockTankOilM3:hcpv/p.oilFormationVolumeFactor,
    equation:"N=A*h*phi*(1-Sw)/Bo",status:"MODELLED" as const,inputs:p,
    limitations:["Homogeneous scenario; net pay and saturations must be representative","No reserves classification, recovery factor, dynamic pressure/flow or economic recoverability inferred"]}
}
