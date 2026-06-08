export const runtime = "nodejs"

const TEMPLATE_CATALOG = [
  { id: "dashboard-saas", title: "SaaS Dashboard", kind: "dashboard", category: "Dashboard" },
  { id: "landing-ai", title: "AI Product Landing", kind: "landing", category: "Landing" },
  { id: "chat-assistant", title: "Chat Assistant", kind: "chat", category: "Chat" },
  { id: "photo-studio", title: "Photo Studio", kind: "photo", category: "Media" },
  { id: "video-studio", title: "Video Studio", kind: "video", category: "Media" },
  { id: "codex-app", title: "Code Generator App", kind: "code", category: "Developer" },
  { id: "startup-pitch", title: "Startup Pitch Deck", kind: "investor", category: "Business" },
  { id: "edu-platform", title: "Education Platform", kind: "education", category: "Kazakhstan" },
] as const

export async function GET() {
  return Response.json({
    ok: true,
    count: TEMPLATE_CATALOG.length,
    templates: TEMPLATE_CATALOG,
    generateRoute: "/api/generate/template",
    note: "Full gallery UI is local; this endpoint lists starter templates for integrations.",
  })
}
