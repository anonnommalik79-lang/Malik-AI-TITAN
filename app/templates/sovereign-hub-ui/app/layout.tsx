import CleanInteractionLayer from "@/components/sovereign/clean-ui/CleanInteractionLayer"
import TitanKeyboardShortcuts from "@/components/sovereign/TitanKeyboardShortcuts"
import type { Metadata } from "next"
import Script from "next/script"
import "./globals.css"
import "./mobile-polish.css"
import "./legendary-aurora.css"
import "./chat-layout-fix.css"
import "./creator-home-polish.css"
import "./creator-clone-safe.css"
import "./malik-hybrid-ui.css"
import "./malik-final-fixes.css"
import "./malik-mobile-worldclass.css"
import "./mobile-performance.css"
import "./titan-reference.css"

export const metadata: Metadata = {
  title: "MALIK AI v6.5 TITAN",
  description: "MALIK AI TITAN — chat, code, image, video and project intelligence workspace",
  generator: "MALIK AI TITAN",
  applicationName: "MALIK AI",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" translate="no" suppressHydrationWarning className="bg-background notranslate">
      <head>
        <meta name="google" content="notranslate" />
        <meta name="robots" content="notranslate" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="theme-color" content="#020303" />
        <Script
          id="malik-supabase-runtime-config"
          src="/api/auth/runtime-config"
          strategy="beforeInteractive"
        />
      </head>
      <body translate="no" suppressHydrationWarning className="min-h-[100dvh] overflow-x-hidden bg-[#020303] font-sans antialiased notranslate">
        <CleanInteractionLayer />
        <TitanKeyboardShortcuts />
        <div id="malik-root" translate="no" className="min-h-[100dvh] overflow-x-hidden notranslate">
          {children}
        </div>
      </body>
    </html>
  )
}
