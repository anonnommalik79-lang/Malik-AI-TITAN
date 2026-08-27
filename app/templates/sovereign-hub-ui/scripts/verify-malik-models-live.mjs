import fs from "node:fs"
import path from "node:path"
import { MALIK_MODELS } from "../lib/ai/malik-models.ts"

const envPath = path.resolve(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2")
  }
}

const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim()
const groqKey = process.env.GROQ_API_KEY?.trim()
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

if (!cerebrasKey || !groqKey || !cloudflareToken || !cloudflareAccountId) {
  console.error("Missing CEREBRAS_API_KEY, GROQ_API_KEY, CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID.")
  process.exit(1)
}

let failed = 0

for (const model of MALIK_MODELS) {
  let url
  let key

  if (model.provider === "cerebras") {
    url = `${(process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(/\/+$/, "")}/chat/completions`
    key = cerebrasKey
  } else if (model.provider === "groq") {
    url = `${(process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "")}/chat/completions`
    key = groqKey
  } else {
    url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccountId)}/ai/v1/chat/completions`
    key = cloudflareToken
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model.providerModel,
        messages: [{ role: "user", content: "Reply with exactly READY" }],
        max_tokens: 256,
        temperature: 0,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    const content = payload?.choices?.[0]?.message?.content
    const passed = response.ok && typeof content === "string" && content.trim().length > 0
    if (!passed) failed += 1
    console.log(`${model.label} -> ${model.provider} -> ${model.providerModel} -> ${passed ? "PASS" : `FAIL (${response.status})`}`)
  } catch (error) {
    failed += 1
    console.log(`${model.label} -> ${model.provider} -> ${model.providerModel} -> FAIL (${error instanceof Error ? error.name : "network"})`)
  }
}

if (failed) {
  console.error(`${failed} Malik model route(s) failed live inference.`)
  process.exit(1)
}

console.log("All 10 Malik model routes passed live inference.")
