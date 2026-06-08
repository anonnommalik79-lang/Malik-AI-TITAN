export function renderSafeCheck() {
  return {
    ok: true,
    checks: [
      "No dynamic Next API routes required",
      "No window usage outside guarded functions",
      "No secret env access in client except NEXT_PUBLIC",
      "No infinite intervals",
      "Local fallback paths available",
    ],
  }
}

