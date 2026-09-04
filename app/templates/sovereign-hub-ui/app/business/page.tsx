import type { Metadata } from "next"
import { BusinessClient } from "@/components/sovereign/business/BusinessClient"

export const metadata: Metadata = {
  title: "Malik AI Business — сайт + AI + бот + заявки",
  description:
    "Готовая система для бизнеса: премиальный сайт, AI-консультант 24/7, Telegram/WhatsApp-бот и автоматизация заявок.",
}

export default function BusinessPage() {
  return <BusinessClient />
}
