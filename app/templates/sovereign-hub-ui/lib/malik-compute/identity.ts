import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { cookies } from "next/headers"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import { computeDirectory } from "./file-store"
import { MalikComputeError } from "./service"

export const COMPUTE_GUEST_COOKIE = "malik-compute-guest"

function signingSecret() {
  if ((process.env.WORKOS_COOKIE_PASSWORD || "").length >= 32) return process.env.WORKOS_COOKIE_PASSWORD!
  const folder = computeDirectory()
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const file = path.join(folder, ".guest-secret")
  if (!existsSync(file)) {
    try { writeFileSync(file, randomBytes(48).toString("hex"), { flag: "wx", mode: 0o600 }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
  }
  const secret = readFileSync(/* turbopackIgnore: true */ file, "utf8")
  if (secret.length < 32) throw new MalikComputeError("MALIK_COMPUTE_STORAGE_UNAVAILABLE", "Не удалось открыть Compute.")
  return secret
}

export function signGuest(id: string, secret: string) {
  return id + "." + createHmac("sha256", secret).update(id).digest("hex")
}

export function verifyGuest(value: string | undefined, secret: string) {
  if (!value || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) return undefined
  const id = value.slice(0, 36)
  return timingSafeEqual(Buffer.from(value), Buffer.from(signGuest(id, secret))) ? id : undefined
}

export async function getComputeIdentity() {
  const { user } = await getOptionalWorkOSAuth()
  if (user?.id) return { userId: "workos:" + user.id, guest: false, admin: isVerifiedOwner(user) }
  const jar = await cookies()
  if (jar.get("malik-guest")?.value !== "1") {
    throw new MalikComputeError("MALIK_COMPUTE_AUTH_REQUIRED", "Войдите в аккаунт или выберите гостевой вход.")
  }
  const secret = signingSecret()
  let id = verifyGuest(jar.get(COMPUTE_GUEST_COOKIE)?.value, secret)
  if (!id) {
    id = randomUUID()
    jar.set(COMPUTE_GUEST_COOKIE, signGuest(id, secret), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: 365 * 24 * 60 * 60,
    })
  }
  return { userId: "guest:" + id, guest: true, admin: false }
}
