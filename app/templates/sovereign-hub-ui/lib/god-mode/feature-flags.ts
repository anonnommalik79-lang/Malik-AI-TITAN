import "server-only"

import { createHash } from "node:crypto"

export type FeatureAudience = {
  userId: string
  owner: boolean
  demo?: boolean
}

function envKey(flag: string) {
  return "MALIK_FEATURE_" + String(flag || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")
}

function rolloutBucket(flag: string, userId: string) {
  const digest = createHash("sha256").update(flag + ":" + userId).digest()
  return digest.readUInt32BE(0) % 100
}

export function featureMode(flag: string) {
  return String(process.env[envKey(flag)] || "").trim().toLowerCase()
}

export function featureEnabled(flag: string, audience: FeatureAudience, defaultEnabled = false) {
  const mode = featureMode(flag)
  if (!mode) return defaultEnabled
  if (["1", "true", "yes", "on", "all"].includes(mode)) return true
  if (["0", "false", "no", "off", "disabled"].includes(mode)) return false
  if (mode === "owner") return audience.owner
  if (mode === "demo") return Boolean(audience.demo || audience.owner)
  const percent = /^(\d{1,3})%?$/.exec(mode)?.[1]
  if (percent) {
    const value = Math.max(0, Math.min(100, Number(percent)))
    if (audience.owner) return true
    return rolloutBucket(flag, audience.userId) < value
  }
  return defaultEnabled
}

export function demoModeEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.MALIK_DEMO_MODE || ""))
}

export function safeFeatureSnapshot(flags: string[], audience: FeatureAudience) {
  return Object.fromEntries(flags.map((flag) => [flag, {
    enabled: featureEnabled(flag, audience),
    mode: featureMode(flag) || "default",
  }]))
}
