import CleanInteractionLayer from "@/components/sovereign/clean-ui/CleanInteractionLayer";
import type { Metadata } from "next"
import "./globals.css"
import "./mobile-polish.css"
import "./legendary-aurora.css"
import "./chat-layout-fix.css"
import "./creator-home-polish.css"
import "./creator-clone-safe.css"
import "./malik-hybrid-ui.css"
import "./malik-final-fixes.css"

export const metadata: Metadata = {
  title: "Malik AI Sovereign",
  description: "Malik AI OS — chat, code, image, video and project canvas workbench",
  generator: "Malik AI Sovereign",
  applicationName: "Malik AI",
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#05070d" />
      </head>
      <body translate="no" suppressHydrationWarning className="min-h-[100dvh] overflow-x-hidden bg-[#030303] font-sans antialiased notranslate">
        <CleanInteractionLayer />
        <div id="malik-root" translate="no" className="min-h-[100dvh] overflow-x-hidden notranslate">
          {children}
        </div>
      </body>
    </html>
  )
}
