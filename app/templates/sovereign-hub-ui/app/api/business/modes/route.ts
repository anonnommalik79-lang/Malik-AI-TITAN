import { BUSINESS_MODES } from "@/lib/business/modes"
import { BUSINESS_SECTIONS } from "@/lib/business/sections"

export const runtime = "nodejs"

export async function GET() {
  return Response.json({
    ok: true,
    engine: "malik-business-engine",
    version: "1.0.0",
    modeCount: BUSINESS_MODES.length,
    sections: BUSINESS_SECTIONS,
    modes: BUSINESS_MODES.map((mode) => ({
      id: mode.id,
      sectionId: mode.sectionId,
      title: mode.title,
      titleRu: mode.titleRu,
      descriptionRu: mode.descriptionRu,
      outputFormat: mode.outputFormat,
    })),
  })
}
