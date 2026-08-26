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
// Strips the effects that cost the most per frame on phones.
import "./mobile-performance.css"
// Final workspace geometry/background pass.
import "./home-viewport-fix.css"
// Absolute last mobile pass: matches the compact native phone reference and
// intentionally wins over every legacy mobile/home/chat rule above.
import "./mobile-reference-final.css"
// Product-nav correction layered after the visual pass.
import "./mobile-reference-nav-patch.css"

const SITE_URL = "https://malikaiworld.world"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Malik AI",
    template: "%s | Malik AI",
  },
  description: "Malik AI — интеллектуальный AI-ассистент для поиска, исследований, кода, изображений, видео и работы с проектами.",
  generator: "Malik AI",
  applicationName: "Malik AI",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Malik AI",
    title: "Malik AI",
    description: "AI-ассистент для поиска, исследований, кода, изображений, видео и проектов.",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
}

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Malik AI",
  alternateName: ["MalikAI", "Malik AI World"],
  url: SITE_URL,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" translate="no" suppressHydrationWarning className="bg-background notranslate">
      <head>
        <meta name="google" content="notranslate" />
        <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="theme-color" content="#05070d" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body translate="no" suppressHydrationWarning className="min-h-[100dvh] overflow-x-hidden bg-[#0f0f10] font-sans antialiased notranslate">
        <AuthKitProvider>
          <div id="malik-root" translate="no" className="min-h-[100dvh] overflow-x-hidden bg-[#0f0f10] notranslate">
            {children}
          </div>
        </AuthKitProvider>
      </body>
    </html>
  )
}
