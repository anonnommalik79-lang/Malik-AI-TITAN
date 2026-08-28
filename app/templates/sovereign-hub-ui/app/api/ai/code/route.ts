import { handleModeAI } from "@/lib/server/mode-ai-handler"

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs"

export const POST = withCompute(handlePOST, "chat")

async function handlePOST(request: Request) {
  return handleModeAI(request, "code")
}
