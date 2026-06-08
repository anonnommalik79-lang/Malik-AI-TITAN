"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[MALIK APP ERROR]", error)
  }, [error])

  const hardReset = () => {
    try {
      localStorage.removeItem("malik_runtime_crash")
      localStorage.removeItem("malik_active_view")
    } catch {}
    reset()
  }

  const goAuth = () => {
    try {
      localStorage.removeItem("malik_auth_mode")
      localStorage.removeItem("malik_user")
      localStorage.removeItem("malik_user_avatar")
      localStorage.removeItem("malik_is_admin")
    } catch {}
    window.location.href = "/"
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030303] px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
          ⚠
        </div>

        <h1 className="text-2xl font-black">Malik AI қорғаныс режимі</h1>

        <p className="mt-3 text-sm leading-6 text-gray-400">
          Бір компонент құлады, бірақ жүйе толық өлген жоқ. Төмендегі батырмалар арқылы қайта іске қос.
        </p>

        <pre className="mt-4 max-h-40 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-3 text-xs text-red-200">
          {error?.message || "Unknown runtime error"}
        </pre>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={hardReset}
            className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-black"
          >
            Қайта жүктеу
          </button>

          <button
            onClick={goAuth}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
          >
            Auth тазалау
          </button>
        </div>
      </div>
    </main>
  )
}

