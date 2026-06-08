export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const mode = String(body.mode || "audit")
  const engine = String(body.engine || "MALIK Codex")
  const prompt = String(body.prompt || "Audit Malik AI project")
  const files = Array.isArray(body.files) ? body.files : []

  if (mode === "full-boss" && !body.confirmed) {
    return Response.json({
      requiresConfirmation: true,
      warning: "Full Boss Mode can change many files. Confirm before execution.",
      mode,
    })
  }

  return Response.json({
    ok: true,
    mode,
    engine,
    engineReady: true,
    prompt: [
      "MALIK CODEX RELEASE PLAN",
      `Mode: ${mode}`,
      `Engine: ${engine}`,
      `Task: ${prompt}`,
      `Files: ${files.join(", ") || "auto scan"}`,
      "Result: safe backend hook is online. Live execution starts when server runtime credentials are configured.",
    ].join("\n"),
    plan: {
      steps: ["Analyze request", "Prepare safe patch", "Run typecheck/build", "Deploy on Render", "Monitor health"],
      issues: [],
    },
  })
}
