import type { Metadata } from "next"
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components"
import "./globals.css"
import "./mobile-polish.css"
import "./legendary-aurora.css"
import "./chat-layout-fix.css"
import "./creator-home-polish.css"
import "./creator-clone-safe.css"
import "./malik-hybrid-ui.css"
import "./malik-final-fixes.css"
import "./malik-mobile-worldclass.css"
// Gold surface rules; must beat creator-clone-safe.css, so it loads after it.
import "./theme-titan.css"
import "./titan-home.css"
import "./malik-model-selector.css"
import "./titan-templates.css"
import "./titan-chat.css"
// Last import wins: strips the effects that cost the most per frame on phones.
import "./mobile-performance.css"

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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="theme-color" content="#05070d" />
      </head>
      <body translate="no" suppressHydrationWarning className="min-h-[100dvh] overflow-x-hidden bg-[#030303] font-sans antialiased notranslate">
        <AuthKitProvider>
          <div id="malik-root" translate="no" className="min-h-[100dvh] overflow-x-hidden notranslate">
            {children}
          </div>
        </AuthKitProvider>
      </body>
    </html>
  )
}
