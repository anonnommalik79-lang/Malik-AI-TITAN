import type { Metadata } from "next"
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components"
import { NoBlueUiGuard } from "@/components/sovereign/NoBlueUiGuard"
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
// True product-wide phone shell. This MUST stay last so legacy mobile rules
// cannot squeeze desktop geometry back into the phone viewport.
import "./mobile-app-shell-v3.css"
// Final surface authority: true black app/auth backgrounds and no right rail.
import "./malik-pure-black-final.css"
// Final phone welcome geometry: larger mark/type and a higher hero position.
import "./mobile-welcome-final.css"
// Final attachment/menu authority: native media inputs and foreground tools.
import "./malik-attachment-tools-final.css"
// Plugins must stay pure black even when Titan gold surface rules are active.
import "./plugin-pure-black-final.css"
// Absolute final authority: OLED black canvases + neutral non-blue controls.
import "./malik-black-neutral-ultimate.css"
// Last of all: eliminate blue/navy UI paint on desktop and mobile.
import "./malik-zero-blue-final.css"
// Exact user-provided Uber wordmark for Taxi. Must load last so no legacy SVG paint can win.
import "./uber-wordmark-final.css"
// Final desktop sidebar brand mark size. Must load after all legacy sidebar rules.
import "./sidebar-brand-mark-final.css"

const SITE_URL = "https://malikaiworld.world"
const SITE_NAME = "Malik AI"
const SITE_DESCRIPTION =
  "Malik AI — AI-платформа для текста, кода, веб-поиска, изображений, видео и презентаций. Общайтесь с ИИ, создавайте контент и работайте с проектами в одном месте."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    absolute: SITE_NAME,
  },
  description: SITE_DESCRIPTION,
  generator: SITE_NAME,
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon", type: "image/png", sizes: "512x512" },
    ],
    shortcut: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
  },
  keywords: [
    "Malik AI",
    "MalikAI",
    "AI ассистент",
    "искусственный интеллект",
    "AI Казахстан",
    "генерация изображений",
    "генерация видео",
    "AI для кода",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: `${SITE_URL}/`,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black",
  },
}

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  alternateName: ["MalikAI", "Malik AI World"],
  url: `${SITE_URL}/`,
  description: SITE_DESCRIPTION,
  inLanguage: ["ru", "kk", "en"],
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icon`,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" translate="no" suppressHydrationWarning className="bg-black notranslate">
      <head>
        <meta name="google" content="notranslate" />
        <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="theme-color" content="#000000" />
        <meta name="application-name" content={SITE_NAME} />
        <meta name="apple-mobile-web-app-title" content={SITE_NAME} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#000000" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any" />
        <link rel="shortcut icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-icon" sizes="180x180" />
        <link rel="mask-icon" href="/favicon.svg" color="#000000" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body translate="no" suppressHydrationWarning className="min-h-[100dvh] overflow-x-hidden bg-black font-sans antialiased notranslate">
        <NoBlueUiGuard />
        <AuthKitProvider>
          <div id="malik-root" translate="no" className="min-h-[100dvh] overflow-x-hidden bg-black notranslate">
            {children}
          </div>
        </AuthKitProvider>
      </body>
    </html>
  )
}
