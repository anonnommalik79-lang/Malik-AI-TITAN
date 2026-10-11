// Stand-in for lib/server/request-entitlement: the test picks who is asking.
export async function resolveRequestEntitlement() {
  const userId = globalThis.__malikTestUser || "verify-script"
  return {
    authenticated: globalThis.__malikTestAuthenticated !== false,
    userId,
    plan: globalThis.__malikTestPlan || "free",
  }
}
