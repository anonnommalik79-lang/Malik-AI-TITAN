const origin = String(process.env.MALIK_PUBLIC_ORIGIN || process.env.MALIK_SITE_URL || "https://malikaiworld.world").trim().replace(/\/+$/, "")
const secret = String(process.env.MALIK_SCHEDULER_SECRET || "").trim()

if (!secret) {
  console.error("MALIK_SCHEDULER_SECRET is required")
  process.exit(1)
}

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 280_000)
try {
  const response = await fetch(origin + "/api/automations/run", {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-malik-scheduler-secret": secret,
    },
    signal: controller.signal,
  })
  const text = await response.text()
  console.log(text)
  if (!response.ok) process.exit(1)
} finally {
  clearTimeout(timer)
}
