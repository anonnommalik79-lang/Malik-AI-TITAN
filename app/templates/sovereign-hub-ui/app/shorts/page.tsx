import type { Metadata } from "next"
import { ShortsPage } from "./ShortsPage"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Malik Shorts",
  description: "Malik Shorts — клиент YouTube внутри Malik AI: видео, авторы, подписки и библиотека.",
  alternates: { canonical: "/shorts" },
  openGraph: {
    title: "Malik Shorts",
    description: "Смотрите YouTube и управляйте своими подписками и библиотекой внутри Malik AI.",
    url: "https://malikaiworld.world/shorts",
    type: "website",
  },
}

export default function MalikShortsPage() {
  return <ShortsPage path="/shorts" />
}
