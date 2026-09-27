// Stand-in for lib/server/request-entitlement in verification scripts: the
// real module needs the WorkOS session of a running Next.js server.
export async function resolveRequestEntitlement() {
  return { authenticated: false, userId: "verify-script", plan: "free" }
}
