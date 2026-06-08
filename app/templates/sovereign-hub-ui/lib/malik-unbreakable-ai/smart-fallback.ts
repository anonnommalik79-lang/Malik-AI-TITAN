export function smartFallback(kind: string, prompt: string, reason = "") {
  return {
    ok: true,
    fallback: true,
    kind,
    title: "Safe local fallback",
    summary: `Engine unavailable. Local plan created for: ${prompt.slice(0, 160)}`,
    reason,
    nextActions: ["check server runtime", "retry", "use backup engine"],
  }
}

