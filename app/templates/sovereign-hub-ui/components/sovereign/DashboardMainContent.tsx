"use client"

import { memo, type ReactNode } from "react"
import dynamic from "next/dynamic"
import type { AiModeId } from "./power-registry"
import { ChatView, type ChatAttachment, type ChatSendOptions } from "./chat-view"
import { ChatInvestorBackground } from "./ChatInvestorBackground"
import type { Capability } from "@/lib/ai/capabilities/types"

function DashboardPanelSkeleton({ label }: { label: string }) {
  return (
    <section className="flex h-full min-h-[320px] w-full items-center justify-center bg-[#030712] p-6 text-white">
      <div className="w-full max-w-3xl animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
        <div className="h-3 w-32 rounded-full bg-cyan-200/20" />
        <div className="mt-5 h-8 w-64 rounded-xl bg-white/10" />
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 rounded-2xl border border-white/8 bg-white/[0.035]" />)}
        </div>
        <p className="mt-6 text-sm font-bold text-cyan-100/70">Loading {label}...</p>
      </div>
    </section>
  )
}

const Header = dynamic(() => import("./header").then((mod) => mod.Header), { ssr: false })
const WelcomeScreen = dynamic(() => import("./welcome-screen").then((mod) => mod.WelcomeScreen), { ssr: false })
const DigitalBridgeSectionExperience = dynamic(
  () => import("./digital-bridge-sections").then((mod) => mod.DigitalBridgeSectionExperience),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Digital Bridge" /> },
)
const FinalIntelligenceLab = dynamic(
  () => import("./final-intelligence/FinalIntelligenceLab").then((mod) => mod.FinalIntelligenceLab),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Final Intelligence" /> },
)
const UnbreakableShield = dynamic(
  () => import("./unbreakable/UnbreakableShield").then((mod) => mod.UnbreakableShield),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Unbreakable AI" /> },
)
const PhotoGenerationStudio = dynamic(
  () => import("./photo-generation/PhotoGenerationStudio").then((mod) => mod.PhotoGenerationStudio),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Photo Studio" /> },
)
const VideoGenerationStudio = dynamic(
  () => import("./video-generation/VideoGenerationStudio").then((mod) => mod.VideoGenerationStudio),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Video Studio" /> },
)
const CommandCenterStudio = dynamic(
  () => import("./command-center/CommandCenterStudio").then((mod) => mod.CommandCenterStudio),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Command Center" /> },
)
const BusinessCommandCenter = dynamic(
  () => import("./business/BusinessCommandCenter").then((mod) => mod.BusinessCommandCenter),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Business Command Center" /> },
)
const NewsroomStudio = dynamic(
  () => import("./media/NewsroomStudio").then((mod) => mod.NewsroomStudio),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Newsroom Studio" /> },
)
const CapabilitiesPanel = dynamic(
  () => import("./capabilities").then((mod) => mod.CapabilitiesPanel),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Capabilities" /> },
)
const AIGeneratorStudio = dynamic(
  () => import("./ai-generator/AIGeneratorStudio").then((mod) => mod.AIGeneratorStudio),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="AI Generator" /> },
)
const WebsiteGenerationStudio = dynamic(
  () => import("./website-generation/WebsiteGenerationStudio").then((mod) => mod.WebsiteGenerationStudio),
  { ssr: false, loading: () => <DashboardPanelSkeleton label="Website Builder" /> },
)

const DIGITAL_BRIDGE_EXPERIENCE_VIEWS = new Set([
  "search",
  "code-generation",
  "projects",
  "chats",
  "design",
  "templates",
  "settings",
  "billing",
  "support",
  "features",
  "capabilities",
  "analytics",
  "notifications",
  "component-generation",
  "landing-generation",
  "dashboard-generation",
  "document-generation",
  "presentation-generation",
  "template-generation",
  "profile",
])

type DashboardChat = {
  id: string
  title: string
  timestamp: Date
  messages: unknown[]
  isPinned?: boolean
  status?: string
  techStack?: string[]
}

type DashboardMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isStreaming?: boolean
}

export type DashboardMainContentProps = {
  activeView: string
  username: string
  chats: DashboardChat[]
  messages: DashboardMessage[]
  isLoading: boolean
  shouldRenderEmptyHome: boolean
  sidebarCollapsed: boolean
  activeAiMode: AiModeId
  isAdmin: boolean
  onMobileMenuOpen: () => void
  onSendMessage: (message: string, attachments?: ChatAttachment[], options?: ChatSendOptions) => void
  onNewChat: () => void
  onOpenView: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas: (code?: string) => void
  onLogout: () => void
  onModeChange: (mode: AiModeId) => void
  onOpenCommandCenter: () => void
  onWelcomeOpenTemplates: () => void
  onWelcomeOpenWebsite: () => void
  onWelcomeOpenCode: () => void
  onWelcomeOpenBilling: () => void
  onWelcomeOpenCanvas: () => void
  onWelcomeOpenSupport: () => void
  renderRouteFrame: (view: string, children: ReactNode) => ReactNode
}

function DashboardMainContentInner({
  activeView,
  username,
  chats,
  messages,
  isLoading,
  shouldRenderEmptyHome,
  sidebarCollapsed,
  activeAiMode,
  isAdmin,
  onMobileMenuOpen,
  onSendMessage,
  onNewChat,
  onOpenView,
  onOpenCodex,
  onOpenCanvas,
  onLogout,
  onModeChange,
  onOpenCommandCenter,
  onWelcomeOpenTemplates,
  onWelcomeOpenWebsite,
  onWelcomeOpenCode,
  onWelcomeOpenBilling,
  onWelcomeOpenCanvas,
  onWelcomeOpenSupport,
  renderRouteFrame,
}: DashboardMainContentProps) {
  if (activeView === "final-intelligence") {
    return renderRouteFrame(
      activeView,
      <FinalIntelligenceLab
        username={username}
        onViewChange={onOpenView}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={(code) => onOpenCanvas(code)}
        onNewChat={onNewChat}
      />,
    )
  }

  if (activeView === "unbreakable-ai") {
    return renderRouteFrame(
      activeView,
      <UnbreakableShield
        username={username}
        onViewChange={onOpenView}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={(code) => onOpenCanvas(code)}
        onNewChat={onNewChat}
      />,
    )
  }

  if (activeView === "photo-generation") {
    return renderRouteFrame(
      activeView,
      <PhotoGenerationStudio
        username={username}
        onViewChange={onOpenView}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={(code) => onOpenCanvas(code)}
        onNewChat={onNewChat}
      />,
    )
  }

  if (activeView === "video-generation") {
    return renderRouteFrame(
      activeView,
      <VideoGenerationStudio
        username={username}
        onViewChange={onOpenView}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={(code) => onOpenCanvas(code)}
        onNewChat={onNewChat}
      />,
    )
  }

  if (activeView === "command-center") {
    return renderRouteFrame(
      activeView,
      <CommandCenterStudio
        username={username}
        onViewChange={onOpenView}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={(code) => onOpenCanvas(code)}
        onNewChat={onNewChat}
      />,
    )
  }

  if (activeView === "business-command-center") {
    return renderRouteFrame(
      activeView,
      <BusinessCommandCenter
        username={username}
        onViewChange={onOpenView}
        onNewChat={onNewChat}
      />,
    )
  }

  if (activeView === "media-newsroom") {
    return renderRouteFrame(
      activeView,
      <NewsroomStudio
        username={username}
        onViewChange={onOpenView}
        onNewChat={onNewChat}
      />,
    )
  }

  if (activeView === "capabilities") {
    return renderRouteFrame(
      activeView,
      <CapabilitiesPanel
        variant="dashboard"
        onUseCapability={(prompt: string, capability: Capability) => {
          const responseDepth = capability.suggestedMode === "fast" ? "fast" : "deep"
          onOpenView("home")
          onSendMessage(prompt, [], { responseDepth })
        }}
      />,
    )
  }

  if (activeView === "ai-generator") {
    return renderRouteFrame(
      activeView,
      <AIGeneratorStudio
        username={username}
        onViewChange={onOpenView}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={(code) => onOpenCanvas(code)}
        onNewChat={onNewChat}
      />,
    )
  }

  if (activeView === "website-generation") {
    return renderRouteFrame(
      activeView,
      <WebsiteGenerationStudio
        username={username}
        onViewChange={onOpenView}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={(code) => onOpenCanvas(code)}
        onNewChat={onNewChat}
      />,
    )
  }

  if (DIGITAL_BRIDGE_EXPERIENCE_VIEWS.has(activeView)) {
    return renderRouteFrame(
      activeView,
      <DigitalBridgeSectionExperience
        activeView={activeView}
        username={username}
        chats={chats}
        onViewChange={onOpenView}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={(code) => onOpenCanvas(code)}
        onNewChat={onNewChat}
      />,
    )
  }

  return (
    <section className="relative z-10 flex min-w-0 w-full max-w-none flex-1 flex-col h-full">
      <Header
        onMenuClick={onMobileMenuOpen}
        isSidebarCollapsed={sidebarCollapsed}
        onOpenCodex={onOpenCodex}
        onOpenCanvas={() => onOpenCanvas()}
        onViewChange={onOpenView}
        onLogout={onLogout}
        currentMode={activeAiMode}
        onModeChange={onModeChange}
        isOwner={isAdmin}
        userEmail={username}
        homeMode={shouldRenderEmptyHome}
        onOpenCommandCenter={onOpenCommandCenter}
      />
      {!shouldRenderEmptyHome ? (
        <div className="malik-premium-chat-host malik-ai-chat-bg relative z-10 flex min-h-0 min-w-0 w-full max-w-none flex-1 flex-col overflow-hidden">
          <ChatInvestorBackground />
          <ChatView
            messages={messages}
            onSendMessage={onSendMessage}
            isLoading={isLoading}
            currentUser={username}
            userPlan={isAdmin ? "owner" : "free"}
            onOpenCodex={onOpenCodex}
            onForceCanvas={() => onOpenCanvas()}
          />
        </div>
      ) : (
        <WelcomeScreen
          onSubmit={onSendMessage}
          isLoading={isLoading}
          onOpenCodex={onOpenCodex}
          onOpenTemplates={onWelcomeOpenTemplates}
          onOpenWebsite={onWelcomeOpenWebsite}
          onOpenCode={onWelcomeOpenCode}
          onOpenBilling={onWelcomeOpenBilling}
          onOpenCanvas={onWelcomeOpenCanvas}
          onOpenCommandCenter={onOpenCommandCenter}
          onOpenSupport={onWelcomeOpenSupport}
          onOpenCapabilities={() => onOpenView("capabilities")}
        />
      )}
    </section>
  )
}

export const DashboardMainContent = memo(DashboardMainContentInner)
export default DashboardMainContent
