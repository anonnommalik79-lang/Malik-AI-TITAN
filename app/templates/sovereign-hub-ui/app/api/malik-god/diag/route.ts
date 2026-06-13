import { malikGodAnswer } from "@/lib/malik-god-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const test = await malikGodAnswer({ prompt: "привет", disableResearch: true })
  return Response.json({
    ok: true,
    router: "MALIK GITHUB + OPENROUTER + DEEPSEEK V13",
    instantTest: test,
    env: {
      GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN || process.env.GITHUB_MODELS_TOKEN),
      GITHUB_MODEL: process.env.GITHUB_MODEL || null,
      OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
      DEEPSEEK_API_KEY: Boolean(process.env.DEEPSEEK_API_KEY),
      SERPER_API_KEY: Boolean(process.env.SERPER_API_KEY),
      TAVILY_API_KEY: Boolean(process.env.TAVILY_API_KEY),
      BRAVE_SEARCH_API_KEY: Boolean(process.env.BRAVE_SEARCH_API_KEY),
      MALIK_GOD_PROVIDER_CHAIN: process.env.MALIK_GOD_PROVIDER_CHAIN || null,
    },
  })
}
