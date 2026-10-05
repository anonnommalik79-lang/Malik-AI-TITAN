import type { Metadata } from "next"
import { getOptionalWorkOSAuth } from "@/lib/auth/server"
import { isVerifiedOwner } from "@/lib/auth/admin-policy"
import FounderHistoryClient from "./FounderHistoryClient"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Malik AI — Founder History", robots: { index: false, follow: false } }

export default async function FounderHistoryPage() {
  const { user } = await getOptionalWorkOSAuth()
  if (!isVerifiedOwner(user)) return (
    <main className="min-h-screen bg-black px-5 py-20 text-white">
      <div className="mx-auto max-w-lg">
        <p className="mb-4 text-xs tracking-widest text-zinc-500">MALIK AI / PRIVATE</p>
        <h1 className="mb-3 text-3xl font-semibold">Доступ только владельцу</h1>
        <p className="mb-6 text-sm text-zinc-400">Откройте Malik AI и войдите под подтверждённым аккаунтом основателя, затем вернитесь на эту страницу.</p>
        <a href="/" className="inline-flex rounded-xl border border-white px-5 py-3 text-sm">Перейти на Malik AI</a>
      </div>
    </main>
  )
  return <FounderHistoryClient />
}
