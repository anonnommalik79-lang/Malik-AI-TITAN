export function isRefreshTokenReuse(error: unknown) {
  const value = String(error || "").toLowerCase()
  return value.includes("refresh token") || value.includes("already used") || value.includes("invalid refresh")
}

export function authRecoverySteps(error: unknown) {
  if (isRefreshTokenReuse(error)) {
    return ["signOut()", "clear sb-* local/session storage", "reset app auth state", "show login screen"]
  }
  return ["show auth error", "avoid infinite redirect", "let user retry"]
}

