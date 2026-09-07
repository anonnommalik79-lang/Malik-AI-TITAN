const DEFAULT_MALIK_OWNER_EMAIL = "amangeldymalik38@gmail.com"

// Backward-compatible export used by founder/admin client and server modules.
// Keep this fixed so existing imports build correctly; server-side owner checks
// can still use malikOwnerEmail() to honor the optional environment override.
export const MALIK_OWNER_EMAIL = DEFAULT_MALIK_OWNER_EMAIL

export function malikOwnerEmail(): string {
  return (process.env.MALIK_OWNER_EMAIL?.trim().toLowerCase() || DEFAULT_MALIK_OWNER_EMAIL)
}

export function isOwnerEmail(email?: string | null): boolean {
  return email?.trim().toLowerCase() === malikOwnerEmail()
}

export function isVerifiedOwner(user?: { email?: string | null; emailVerified?: boolean } | null): boolean {
  return user?.emailVerified === true && isOwnerEmail(user.email)
}
