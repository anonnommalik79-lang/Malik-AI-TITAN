"use client"

import { useState } from "react"
import { Bell, CheckCircle2, Rocket, Sparkles, X } from "lucide-react"

type NotificationItem = {
  id: string
  title: string
  description: string
  status: "info" | "success" | "warning"
}

const initialNotifications: NotificationItem[] = [
  { id: "render-failed", title: "Render deploy failed", description: "Run npm build first, then push latest commit.", status: "warning" },
  { id: "identity-connected", title: "Sovereign ID ready", description: "Secure login UI is available in safe mode.", status: "success" },
  { id: "project-saved", title: "Project saved", description: "Local project history is ready.", status: "success" },
  { id: "image-generated", title: "Image generated", description: "Photo panel can save to gallery fallback.", status: "info" },
  { id: "runtime-fallback", title: "Backup mode active", description: "MALIK Backup is handling unavailable runtime lanes.", status: "warning" },
  { id: "user-signed-in", title: "User signed in", description: "Session is restored locally.", status: "success" },
  { id: "canvas-opened", title: "Canvas opened", description: "PreviewPanel is ready on the right.", status: "info" },
  { id: "codex-task-created", title: "Codex task created", description: "Malik Codex modal is connected.", status: "info" },
  { id: "file-uploaded", title: "File uploaded", description: "File reader mode can parse attachment UI.", status: "info" },
  { id: "voice-recorded", title: "Voice recorded", description: "Composer voice attachment is ready.", status: "info" },
]

export function NotificationCenter({ onOpenSupport }: { onOpenSupport?: () => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(initialNotifications)

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl border border-white/10 bg-white/[0.04] p-2 text-zinc-300 hover:bg-white/[0.08] hover:text-white"
        aria-label="Open notifications"
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-violet-400" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-white/10 bg-[#08080a] text-white shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div>
              <h3 className="font-black">Notifications</h3>
              <p className="text-xs text-zinc-500">Local product events</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-zinc-500 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[380px] overflow-y-auto p-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "render-failed" || item.id === "runtime-fallback") onOpenSupport?.()
                  setOpen(false)
                }}
                className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-white/[0.06]"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-cyan-100">
                  {item.status === "success" ? <CheckCircle2 className="h-4 w-4" /> : item.status === "warning" ? <Rocket className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">{item.description}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 border-t border-white/10 p-3">
            <button type="button" onClick={() => setItems([])} className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-zinc-300 hover:bg-white/10">
              Clear all
            </button>
            <button type="button" onClick={onOpenSupport} className="flex-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-black hover:bg-cyan-100">
              Open support
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationCenter

