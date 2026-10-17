import { websiteProjectsRequest } from "@/lib/website/engine/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = (request: Request) => websiteProjectsRequest(request)
export const POST = (request: Request) => websiteProjectsRequest(request)
