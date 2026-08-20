import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const contracts = [
  {
    file: "components/sovereign/sidebar.tsx",
    required: ["Новый чат", "Malik Codex", "Изображения", "Видео", "Код"],
  },
  {
    file: "components/sovereign/header.tsx",
    required: ["Рабочая область", "Проекты", "Библиотека", "Аналитика"],
  },
  {
    file: "components/sovereign/hybrid/MalikHybridHome.tsx",
    required: ["MALIK AI", "TITAN", "MalikLLM75B", "AI Chat", "CRM System"],
  },
  {
    file: "components/sovereign/TitanRightRail.tsx",
    required: ["Недавние чаты", "Контекст", "Статус системы", "/api/ai/status", "/api/ai/usage"],
  },
  {
    file: "app/titan-reference.css",
    required: ["--titan-gold", ".malik-sidebar", "prefers-reduced-motion", "content-visibility"],
  },
]

const failures = []
for (const contract of contracts) {
  const full = path.join(root, contract.file)
  if (!fs.existsSync(full)) {
    failures.push(`${contract.file}: missing file`)
    continue
  }
  const text = fs.readFileSync(full, "utf8")
  for (const token of contract.required) {
    if (!text.includes(token)) failures.push(`${contract.file}: missing ${JSON.stringify(token)}`)
  }
}

if (failures.length) {
  console.error("TITAN reference guard failed:\n" + failures.map((item) => ` - ${item}`).join("\n"))
  process.exit(1)
}

console.log("TITAN reference guard passed: shell, hero, composer, rail and gold calibration are present.")
