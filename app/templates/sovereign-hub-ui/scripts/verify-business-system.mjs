import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const required = [
  "app/business/page.tsx",
  "app/business/dashboard/page.tsx",
  "components/sovereign/business/BusinessClient.tsx",
  "components/sovereign/business/BusinessDashboardClient.tsx",
  "app/api/business/ai/route.ts",
  "app/api/business/leads/route.ts",
  "app/api/business/telegram/webhook/route.ts",
  "app/api/business/whatsapp/webhook/route.ts",
  ".env.business.example",
]

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)))
if (missing.length) {
  console.error("Missing Malik Business files:", missing.join(", "))
  process.exit(1)
}

const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const checks = [
  ["business page uses client", read("app/business/page.tsx").includes("BusinessClient")],
  ["AI route uses Malik Brain", read("app/api/business/ai/route.ts").includes("runMalikBrain")],
  ["lead API owner guard", read("app/api/business/leads/route.ts").includes("requireMalikAdminAsync")],
  ["lead API supports patch", read("app/api/business/leads/route.ts").includes("export async function PATCH")],
  ["Telegram verifies secret", read("app/api/business/telegram/webhook/route.ts").includes("x-telegram-bot-api-secret-token")],
  ["Telegram handles callbacks", read("app/api/business/telegram/webhook/route.ts").includes("answerCallbackQuery")],
  ["WhatsApp verifies signature", read("app/api/business/whatsapp/webhook/route.ts").includes("x-hub-signature-256")],
  ["WhatsApp Graph version is env-driven", read("app/api/business/whatsapp/webhook/route.ts").includes("WHATSAPP_GRAPH_VERSION")],
  ["lead form has honeypot", read("components/sovereign/business/BusinessClient.tsx").includes('name="company_site"')],
  ["business has RU/KK/EN", ["ru:", "kk:", "en:"].every((token) => read("components/sovereign/business/BusinessClient.tsx").includes(token))],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`)
if (failed.length) process.exit(1)
console.log(`Malik Business verification passed (${checks.length}/${checks.length})`)
