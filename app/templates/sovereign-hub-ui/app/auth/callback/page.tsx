"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseClient, persistSupabaseUser, syncProfile } from "@/lib/supabase"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState("Securing your Sovereign ID...")

  useEffect(() => {
    let active = true
    void (async () => {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("identity_runtime_unavailable")
      const code = new URL(window.location.href).searchParams.get("code")
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
      }
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.user) throw error || new Error("identity_session_missing")
      persistSupabaseUser(data.session.user)
      await syncProfile(data.session)
      if (active) router.replace("/dashboard")
    })().catch(() => {
      if (active) setMessage("Secure login could not be completed. Please return to the login page and try again.")
    })
    return () => { active = false }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#02040c] p-6 text-white">
      <section className="max-w-lg rounded-3xl border border-cyan-300/15 bg-white/[0.04] p-8 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/70">Sovereign ID</p>
        <h1 className="mt-4 text-3xl font-black">MALIK AI</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">{message}</p>
        {message.includes("could not") ? (
          <button type="button" onClick={() => router.replace("/auth")} className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black">
            Return to login
          </button>
        ) : null}
      </section>
    </main>
  )
}
