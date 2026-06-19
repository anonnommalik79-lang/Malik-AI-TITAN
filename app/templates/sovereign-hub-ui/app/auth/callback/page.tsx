"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseClient, persistSupabaseUser, syncProfile } from "@/lib/supabase"

function getErrorText(error: unknown) {
  if (!error) return "unknown_error"
  if (typeof error === "string") return error
  const anyError = error as any
  return anyError?.message || anyError?.error_description || anyError?.name || JSON.stringify(error)
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState("Securing your Sovereign ID...")
  const [debug, setDebug] = useState("")

  useEffect(() => {
    let active = true

    void (async () => {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client is not configured")

      const url = new URL(window.location.href)
      const code = url.searchParams.get("code")
      const urlError = url.searchParams.get("error") || url.searchParams.get("error_description")

      if (urlError) throw new Error(urlError)

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error

        window.history.replaceState({}, document.title, "/auth/callback")
      }

      const { data, error } = await supabase.auth.getSession()
      if (error) throw error

      const user = data.session?.user
      if (!data.session || !user) throw new Error("No Supabase session after OAuth callback")

      persistSupabaseUser(user)
      await syncProfile(data.session)

      if (active) router.replace("/dashboard")
    })().catch((err) => {
      const text = getErrorText(err)
      console.error("[auth/callback]", err)

      try {
        localStorage.setItem("malik_auth_callback_error", text)
      } catch {}

      if (active) {
        setDebug(text)
        setMessage("Secure login could not be completed. Please return to the login page and try again.")
      }
    })

    return () => {
      active = false
    }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#02040c] p-6 text-white">
      <section className="max-w-lg rounded-3xl border border-cyan-300/15 bg-white/[0.04] p-8 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/70">Sovereign ID</p>
        <h1 className="mt-4 text-3xl font-black">MALIK AI</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">{message}</p>

        {debug ? (
          <p className="mt-4 break-words rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-left text-xs text-red-100">
            Debug: {debug}
          </p>
        ) : null}

        {message.includes("could not") ? (
          <button
            type="button"
            onClick={() => router.replace("/auth")}
            className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black"
          >
            Return to login
          </button>
        ) : null}
      </section>
    </main>
  )
}
