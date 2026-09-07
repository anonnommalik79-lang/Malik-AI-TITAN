const DEFAULT_MALIK_OWNER_EMAIL = "amangeldymalik38@gmail.com"

export function malikOwnerEmail(): string {
  return (process.env.MALIK_OWNER_EMAIL?.trim().toLowerCase() || DEFAULT_MALIK_OWNER_EMAIL)
}

export function isOwnerEmail(email?: string | null): boolean {
  return email?.trim().toLowerCase() === malikOwnerEmail()
}

export function isVerifiedOwner(user?: { email?: string | null; emailVerified?: boolean } | null): boolean {
  return user?.emailVerified === true && isOwnerEmail(user.email)
}
