// The owner identity is fixed; client preferences and env lists never grant access.
export const MALIK_OWNER_EMAIL = "amangeldymalik38@gmail.com"

export function isOwnerEmail(email?: string | null): boolean {
  return email?.trim().toLowerCase() === MALIK_OWNER_EMAIL
}

export function isVerifiedOwner(user?: { email?: string | null; emailVerified?: boolean } | null): boolean {
  return user?.emailVerified === true && isOwnerEmail(user.email)
}
