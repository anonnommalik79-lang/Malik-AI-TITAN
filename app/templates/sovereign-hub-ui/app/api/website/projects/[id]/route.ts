import { websiteProjectsRequest } from "@/lib/website/engine/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ id: string }> }
export const GET = async (request: Request, context: Context) => websiteProjectsRequest(request, (await context.params).id)
export const POST = async (request: Request, context: Context) => websiteProjectsRequest(request, (await context.params).id)
