"use client"

export type AiModeId =
  | "auto"
  | "chat"
  | "code"
  | "website"
  | "image"
  | "video"
  | "research"
  | "agent"
  | "architect"
  | "debug"
  | "canvas"
  | "presentation"
  | "pdf"
  | "word"
  | "data"
  | "security"
  | "qazaq-rescue"
  | "fast"
  | "deep"
  | "creator"

export type PowerAction = {
  id: string
  title: string
  category: string
  description: string
  actionType: string
  safeStatus: string
}

export const AI_MODES: Array<{ id: AiModeId; label: string; description: string }> = [
  { id: "auto", label: "Auto", description: "Routes requests to chat, canvas, code or media." },
  { id: "chat", label: "Chat", description: "Keeps answers in the conversation." },
  { id: "code", label: "Code", description: "Optimizes answers for files and code blocks." },
  { id: "website", label: "Website", description: "Opens canvas for websites and layouts." },
  { id: "image", label: "Image", description: "Prepares image generation and analysis." },
  { id: "video", label: "Video", description: "Prepares video generation and analysis." },
  { id: "research", label: "Research", description: "Structures answers as research notes." },
  { id: "agent", label: "Agent", description: "Plans tasks like an AI worker." },
  { id: "architect", label: "Architect", description: "Creates file plans and product structure." },
  { id: "debug", label: "Debug", description: "Formats answers as bug report and fixes." },
  { id: "canvas", label: "Canvas", description: "Forces generated artifacts into preview." },
  { id: "presentation", label: "Presentation", description: "Creates slide outlines and pitch structure." },
  { id: "pdf", label: "PDF", description: "Creates report-ready document structure." },
  { id: "word", label: "Word", description: "Creates editable document structure." },
  { id: "data", label: "Data", description: "Analyzes tables, metrics and datasets." },
  { id: "security", label: "Security Defensive", description: "Defensive-only checks and reports." },
  { id: "qazaq-rescue", label: "Qazaq Rescue", description: "Emergency planning and rescue documents." },
  { id: "fast", label: "Fast", description: "Short practical answers." },
  { id: "deep", label: "Deep", description: "More detailed reasoning and planning." },
  { id: "creator", label: "Creator", description: "Brand, design and launch content." },
]

export const CORE_POWER_ACTIONS: PowerAction[] = [
  { id: "open-home", title: "Open Home", category: "Navigation", description: "Return to the main Malik AI dashboard.", actionType: "open-home", safeStatus: "Connected" },
  { id: "open-photo-studio", title: "Open Photo Studio", category: "Media", description: "Open the photo generation panel.", actionType: "open-photo", safeStatus: "Connected" },
  { id: "open-video-studio", title: "Open Video Studio", category: "Media", description: "Open the video generation panel.", actionType: "open-video", safeStatus: "Connected" },
  { id: "open-malik-codex", title: "Open Malik Codex", category: "Agent", description: "Open Malik Codex modal.", actionType: "open-codex", safeStatus: "Connected" },
  { id: "open-canvas-command", title: "Open Canvas", category: "Canvas", description: "Open the right preview canvas.", actionType: "open-canvas", safeStatus: "Connected" },
  { id: "open-support-command", title: "Open Support", category: "Support", description: "Open Support 24/7 panel.", actionType: "open-support", safeStatus: "Connected" },
  { id: "open-api-status-command", title: "Open API Status", category: "Admin", description: "Show safe API status guidance.", actionType: "open-api-status", safeStatus: "Safe UI action" },
  { id: "open-deploy-guide-command", title: "Open Deploy Guide", category: "Deploy", description: "Open deploy checklist and Render guide.", actionType: "open-deploy", safeStatus: "Guide ready" },
  { id: "open-pro-upgrade", title: "Open Pro Upgrade", category: "Billing", description: "Open Telegram Pro upgrade contact.", actionType: "open-pro", safeStatus: "Telegram link" },
  { id: "reset-usage", title: "Reset Usage", category: "Admin", description: "Reset local frontend usage counters.", actionType: "reset-usage", safeStatus: "localStorage safe" },
  { id: "copy-build-command", title: "Copy Build Command", category: "Deploy", description: "Copy npm build command.", actionType: "copy-build-command", safeStatus: "Clipboard action" },
  { id: "create-website-prompt", title: "Create Website Prompt", category: "Creator", description: "Open canvas with a website starter artifact.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "create-photo-prompt", title: "Create Photo Prompt", category: "Media", description: "Open photo studio for a new image prompt.", actionType: "open-photo", safeStatus: "Connected" },
  { id: "create-video-prompt", title: "Create Video Prompt", category: "Media", description: "Open video studio for a new video prompt.", actionType: "open-video", safeStatus: "Connected" },
  { id: "create-code-prompt", title: "Create Code Prompt", category: "Code", description: "Switch to code mode for code generation.", actionType: "set-mode:code", safeStatus: "Connected" },
  { id: "auto-route-mode", title: "Auto Route Mode", category: "Power", description: "Automatically chooses chat, code, canvas, codex or media flow.", actionType: "set-mode:auto", safeStatus: "Connected to mode switch" },
  { id: "website-mode", title: "Website Mode", category: "Power", description: "Website requests open the right canvas preview.", actionType: "set-mode:website", safeStatus: "Connected to canvas" },
  { id: "code-mode", title: "Code Mode", category: "Power", description: "Asks Malik AI to return code blocks and file-style answers.", actionType: "set-mode:code", safeStatus: "Connected to chat instruction" },
  { id: "architect-mode", title: "Architect Mode", category: "Power", description: "Creates file plans, module boundaries and architecture notes.", actionType: "set-mode:architect", safeStatus: "Connected to planning prompt" },
  { id: "debug-mode", title: "Debug Mode", category: "Power", description: "Formats output as bug report, suspected cause and fix steps.", actionType: "set-mode:debug", safeStatus: "Connected to chat instruction" },
  { id: "image-analyze-mode", title: "Image Analyze Mode", category: "Power", description: "Shows image analysis status when an image is attached.", actionType: "set-mode:image", safeStatus: "UI ready" },
  { id: "video-analyze-mode", title: "Video Analyze Mode", category: "Power", description: "Shows video timeline analysis status for video attachments.", actionType: "set-mode:video", safeStatus: "UI ready" },
  { id: "file-reader-mode", title: "File Reader Mode", category: "Power", description: "Shows document parsing status for file attachments.", actionType: "set-mode:data", safeStatus: "UI ready" },
  { id: "voice-mode", title: "Voice Mode", category: "Power", description: "Shows voice listening status for audio attachments.", actionType: "set-mode:chat", safeStatus: "Composer mic ready" },
  { id: "canvas-auto-open", title: "Canvas Auto Open", category: "Power", description: "Opens PreviewPanel when code, HTML or TSX is generated.", actionType: "open-canvas", safeStatus: "Connected to preview" },
  { id: "project-save", title: "Project Save", category: "Power", description: "Saves generated files into local project history UI.", actionType: "open-projects", safeStatus: "Local history ready" },
  { id: "template-quick-use", title: "Template Quick Use", category: "Power", description: "Sends template prompts to chat or canvas.", actionType: "open-templates", safeStatus: "Connected to templates" },
  { id: "api-health-drawer", title: "API Health Drawer", category: "Power", description: "Displays engine status without exposing secrets.", actionType: "open-api-status", safeStatus: "Safe frontend check" },
  { id: "deploy-guide-drawer", title: "Deploy Guide Drawer", category: "Power", description: "Shows build command and Render/Vercel checklist.", actionType: "open-deploy", safeStatus: "Guide only" },
  { id: "command-palette", title: "Command Palette", category: "Power", description: "Ctrl+K search for actions and 75 registered functions.", actionType: "open-command-palette", safeStatus: "Connected" },
  { id: "notifications", title: "Notifications", category: "Power", description: "Local notification center for deploy, auth, canvas and Codex events.", actionType: "open-notifications", safeStatus: "Connected" },
  { id: "usage-meter", title: "Usage Meter", category: "Power", description: "Shows credits, plan, cost estimate and reset time.", actionType: "open-billing", safeStatus: "Connected to billing view" },
  { id: "owner-tools", title: "Owner Tools", category: "Power", description: "Owner-only shortcuts for product control.", actionType: "owner-tools", safeStatus: "UI gated" },
  { id: "safe-fallback", title: "Safe Fallback", category: "Power", description: "Shows fallback UI when APIs are missing or fail.", actionType: "safe-fallback", safeStatus: "Already active" },
  { id: "render-guard", title: "Render Guard", category: "Power", description: "Prompts to run npm build before push or deploy.", actionType: "open-deploy", safeStatus: "Guide ready" },
]

export const POWER_REGISTRY: PowerAction[] = [
  { id: "create-saas-landing", title: "Create SaaS Landing", category: "Creator", description: "Generate a SaaS launch page with hero, features, pricing and CTA.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "create-admin-dashboard", title: "Create Admin Dashboard", category: "Website", description: "Generate an admin dashboard with metrics, tables and controls.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "create-ai-chat-ui", title: "Create AI Chat UI", category: "Design", description: "Generate a premium assistant chat interface.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "create-pricing-page", title: "Create Pricing Page", category: "Business", description: "Generate pricing tiers, limits and upgrade CTA.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "create-portfolio", title: "Create Portfolio", category: "Creator", description: "Generate a portfolio with case studies and contact CTA.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "create-ecommerce", title: "Create E-commerce", category: "Website", description: "Generate storefront, product grid and cart summary.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "create-mobile-app-ui", title: "Create Mobile App UI", category: "Design", description: "Generate a mobile-first app shell with tabs and cards.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "create-api-route", title: "Create API Route", category: "Code", description: "Draft a safe API route contract and handler outline.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "create-database-schema", title: "Create Database Schema", category: "Data", description: "Draft tables, fields and relationships.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "create-readme", title: "Create README", category: "Files", description: "Generate installation, usage and deploy notes.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "create-pitch-deck-outline", title: "Create Pitch Deck Outline", category: "Business", description: "Generate investor deck structure.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "create-pdf-report", title: "Create PDF Report", category: "Files", description: "Create a report outline ready for PDF export.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "create-word-report", title: "Create Word Report", category: "Files", description: "Create a Word-style report outline.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "create-presentation-plan", title: "Create Presentation Plan", category: "Education", description: "Create slide titles and speaking notes.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "analyze-image", title: "Analyze Image", category: "Media", description: "Prepare visual analysis mode for image attachments.", actionType: "set-mode:image", safeStatus: "UI ready" },
  { id: "analyze-video", title: "Analyze Video", category: "Media", description: "Prepare timeline analysis mode for video attachments.", actionType: "set-mode:video", safeStatus: "UI ready" },
  { id: "read-uploaded-file", title: "Read Uploaded File", category: "Files", description: "Prepare file reader status for attachments.", actionType: "set-mode:data", safeStatus: "UI ready" },
  { id: "summarize-document", title: "Summarize Document", category: "Files", description: "Summarize uploaded documents into key points.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "extract-tasks", title: "Extract Tasks", category: "Automation", description: "Extract actionable tasks from text or files.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "generate-tests", title: "Generate Tests", category: "Code", description: "Generate test plan and example test cases.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "debug-error-log", title: "Debug Error Log", category: "Code", description: "Analyze an error log and propose fixes.", actionType: "set-mode:debug", safeStatus: "Debug mode ready" },
  { id: "explain-code", title: "Explain Code", category: "Code", description: "Explain pasted code in simple steps.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "refactor-code", title: "Refactor Code", category: "Code", description: "Plan safer refactors without replacing the project.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "generate-architecture", title: "Generate Architecture", category: "Projects", description: "Create system architecture and module plan.", actionType: "set-mode:architect", safeStatus: "Architect mode ready" },
  { id: "create-file-tree", title: "Create File Tree", category: "Projects", description: "Generate a project file tree plan.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "export-project-json", title: "Export Project JSON", category: "Projects", description: "Prepare a JSON export guide for project metadata.", actionType: "open-projects", safeStatus: "Guide ready" },
  { id: "export-zip-guide", title: "Export ZIP Guide", category: "Deploy", description: "Show safe ZIP export steps.", actionType: "open-deploy", safeStatus: "Guide ready" },
  { id: "render-build-checklist", title: "Render Build Checklist", category: "Deploy", description: "Show npm build, GitHub push and Render redeploy steps.", actionType: "open-deploy", safeStatus: "Guide ready" },
  { id: "vercel-deploy-guide", title: "Vercel Deploy Guide", category: "Deploy", description: "Show Vercel deploy guidance without fake API calls.", actionType: "open-deploy", safeStatus: "Guide ready" },
  { id: "workos-status", title: "Sovereign ID Status", category: "Admin", description: "Show WorkOS identity runtime status in the safe API drawer.", actionType: "open-api-status", safeStatus: "UI only" },
  { id: "api-status", title: "API Status", category: "Admin", description: "Show engine statuses and fallback states.", actionType: "open-api-status", safeStatus: "UI only" },
  { id: "billing-setup-guide", title: "Billing Setup Guide", category: "Business", description: "Open billing and usage planning.", actionType: "open-billing", safeStatus: "Connected to billing view" },
  { id: "usage-limits-setup", title: "Usage Limits Setup", category: "Admin", description: "Plan usage limits and cost guardrails.", actionType: "open-billing", safeStatus: "Guide ready" },
  { id: "storage-setup-guide", title: "Storage Setup Guide", category: "Files", description: "Plan storage buckets and generated artifacts.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "worker-queue-setup", title: "Worker Queue Setup", category: "Automation", description: "Plan background generation workers.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "realtime-status-setup", title: "Realtime Status Setup", category: "Automation", description: "Plan realtime progress and event streams.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "observability-setup", title: "Observability Setup", category: "Admin", description: "Plan logs, health and alerts.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "anti-spam-setup", title: "Anti-Spam Setup", category: "Safety", description: "Plan safe limits and abuse controls.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "safe-security-audit", title: "Safe Security Audit", category: "Safety", description: "Create defensive security audit checklist.", actionType: "set-mode:security", safeStatus: "Defensive only" },
  { id: "exif-checker-ui", title: "EXIF Checker UI", category: "Safety", description: "Generate UI for checking image metadata safely.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "defensive-scan-report", title: "Defensive Scan Report", category: "Safety", description: "Create a defensive scan report template.", actionType: "prompt-chat", safeStatus: "Defensive only" },
  { id: "ctf-training-mode", title: "CTF Training Mode", category: "Education", description: "Create safe CTF learning exercises.", actionType: "set-mode:security", safeStatus: "Training only" },
  { id: "qazaq-rescue-protocol", title: "Qazaq Rescue Protocol", category: "Rescue", description: "Create emergency protocol checklist.", actionType: "set-mode:qazaq-rescue", safeStatus: "Guide ready" },
  { id: "earthquake-plan", title: "Earthquake Plan", category: "Rescue", description: "Create an earthquake preparation plan.", actionType: "prompt-chat", safeStatus: "Guide ready" },
  { id: "offline-qr-help", title: "Offline QR Help", category: "Rescue", description: "Plan offline QR instructions for emergencies.", actionType: "prompt-chat", safeStatus: "Guide ready" },
  { id: "school-drill-plan", title: "School Drill Plan", category: "Rescue", description: "Create school drill plan structure.", actionType: "prompt-chat", safeStatus: "Guide ready" },
  { id: "emergency-pdf", title: "Emergency PDF", category: "Rescue", description: "Create emergency PDF content outline.", actionType: "prompt-chat", safeStatus: "Guide ready" },
  { id: "family-safety-plan", title: "Family Safety Plan", category: "Rescue", description: "Create family safety checklist.", actionType: "prompt-chat", safeStatus: "Guide ready" },
  { id: "project-history", title: "Project History", category: "Projects", description: "Open local project history.", actionType: "open-projects", safeStatus: "Connected" },
  { id: "recent-chats", title: "Recent Chats", category: "Projects", description: "Open recent chat list.", actionType: "open-chats", safeStatus: "Connected" },
  { id: "pinned-projects", title: "Pinned Projects", category: "Projects", description: "Open pinned projects area.", actionType: "open-projects", safeStatus: "Connected" },
  { id: "template-gallery", title: "Template Gallery", category: "Design", description: "Open premium template gallery.", actionType: "open-templates", safeStatus: "Connected" },
  { id: "design-tokens", title: "Design Tokens", category: "Design", description: "Open design system tokens.", actionType: "open-design", safeStatus: "Connected" },
  { id: "copy-tailwind-theme", title: "Copy Tailwind Theme", category: "Design", description: "Copy a theme guide prompt.", actionType: "copy-guide", safeStatus: "Clipboard action" },
  { id: "typography-scale", title: "Typography Scale", category: "Design", description: "Generate type scale guidance.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "button-system", title: "Button System", category: "Design", description: "Generate button variants and states.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "card-system", title: "Card System", category: "Design", description: "Generate card variants and responsive states.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "animation-presets", title: "Animation Presets", category: "Design", description: "Generate animation preset ideas.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "glassmorphism-preset", title: "Glassmorphism Preset", category: "Design", description: "Generate glass UI preset.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "cyberpunk-preset", title: "Cyberpunk Preset", category: "Design", description: "Generate cyberpunk visual preset.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "apple-clean-preset", title: "Apple Clean Preset", category: "Design", description: "Generate clean product UI preset.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "startup-preset", title: "Startup Preset", category: "Design", description: "Generate startup landing visual preset.", actionType: "prompt-canvas", safeStatus: "Canvas fallback ready" },
  { id: "investor-mode", title: "Investor Mode", category: "Business", description: "Prepare investor-friendly product framing.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "founder-bio-generator", title: "Founder Bio Generator", category: "Business", description: "Generate founder bio and story.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "press-release", title: "Press Release", category: "Business", description: "Generate launch press release.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "business-plan", title: "Business Plan", category: "Business", description: "Generate business plan outline.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "roadmap-generator", title: "Roadmap Generator", category: "Business", description: "Generate product roadmap.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "competitor-matrix", title: "Competitor Matrix", category: "Business", description: "Generate competitor comparison matrix.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "user-persona", title: "User Persona", category: "Business", description: "Generate target user personas.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "landing-copy", title: "Landing Copy", category: "Creator", description: "Generate landing page copy blocks.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "terms-draft", title: "Terms Draft", category: "Admin", description: "Generate a non-legal terms draft outline.", actionType: "prompt-chat", safeStatus: "Draft only" },
  { id: "privacy-draft", title: "Privacy Draft", category: "Admin", description: "Generate a non-legal privacy draft outline.", actionType: "prompt-chat", safeStatus: "Draft only" },
  { id: "faq-generator", title: "FAQ Generator", category: "Creator", description: "Generate product FAQ.", actionType: "prompt-chat", safeStatus: "Chat ready" },
  { id: "support-center", title: "Support Center", category: "Admin", description: "Open support center.", actionType: "open-support", safeStatus: "Connected" },
  { id: "recovery-center", title: "Recovery Center", category: "Safety", description: "Open recovery and fallback guidance.", actionType: "open-support", safeStatus: "Guide ready" },
]

export const COMMAND_ACTIONS: PowerAction[] = [...CORE_POWER_ACTIONS, ...POWER_REGISTRY]

