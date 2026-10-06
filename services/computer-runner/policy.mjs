import { isIP } from "node:net"
import { lookup } from "node:dns/promises"

export function publicAddress(address) {
  const ip = address.toLowerCase().split("%")[0]
  if (ip.includes(":")) {
    if (ip.startsWith("::ffff:")) return publicAddress(ip.slice(7))
    // Accept global-unicast IPv6 only. Reject local, link-local and transition ranges.
    return /^[23][0-9a-f]{3}:/u.test(ip) && !ip.startsWith("2001:db8:") && !ip.startsWith("2002:") && !ip.startsWith("2001:0:")
  }
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false
  const [a, b] = parts
  return !([0, 10, 127].includes(a) || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && [0, 168].includes(b) || a === 100 && b >= 64 && b <= 127 || a === 198 && [18, 19].includes(b))
}
export async function publicUrl(value, resolver = lookup) {
  const url = new URL(String(value || ""))
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("Только публичные HTTPS-страницы разрешены.")
  const host = url.hostname.replace(/^\[|\]$/gu, "")
  if (/localhost|\.local$|\.internal$|\.localhost$/iu.test(host)) throw new Error("Локальный адрес недоступен.")
  const addresses = isIP(host) ? [{ address: host }] : await resolver(host, { all: true })
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error("Непубличный адрес недоступен.")
  return url.toString()
}
export function actionPolicy(plan, control) {
  if (["done", "handoff", "scroll", "navigate"].includes(plan.action)) return plan.action
  if (!control || !["click", "fill"].includes(plan.action)) return "invalid"
  if (control.type === "password" || /password|парол|otp|verification code|код подтверждения|captcha|credit.card|номер карты|cvv|cvc/iu.test(`${control.label} ${control.type}`)) return "handoff"
  if (plan.action === "click" && control.tag === "a" && control.href && !control.inForm) return "navigate"
  return "confirm"
}
