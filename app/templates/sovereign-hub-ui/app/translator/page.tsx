import type { Metadata } from "next"
import { MalikTranslator } from "@/components/translator/MalikTranslator"

export const metadata: Metadata = {
  title: "Malik Translator",
  description: "Быстрый отдельный переводчик Malik Translator.",
}

export default function TranslatorPage() {
  return <MalikTranslator />
}
