"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Mail, RefreshCw, Search, ShieldCheck } from "lucide-react"

type Lead = {
  id: string
  name: string
  company: string
  contact: string
  niche: string
  website?: string | null
  message?: string | null
  source?: string | null
  lang?: string | null
  status?: string | null
  priority?: string | null
  created_at?: string | null
  updated_at?: string | null
}

const statusOptions = ["new", "qualified", "contacted", "proposal", "won", "lost"]
const priorityOptions = ["low", "normal", "high", "hot"]

export function BusinessDashboardClient({ ownerEmail }: { ownerEmail: string }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [saving, setSaving] = useState<string | null>(null)

  async function loadLeads() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/business/leads", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "load_failed")
      setLeads(Array.isArray(payload?.leads) ? payload.leads : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed")
    } finally {
      setLoading(false)
    }
  }

  async function patchLead(id: string, patch: Record<string, string>) {
    setSaving(id)
    try {
      const response = await fetch("/api/business/leads", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      })
      if (!response.ok) throw new Error("update_failed")
      setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)))
    } finally {
      setSaving(null)
    }
  }

  useEffect(() => {
    loadLeads()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return leads.filter((lead) => {
      if (status !== "all" && lead.status !== status) return false
      if (!q) return true
      return [lead.name, lead.company, lead.contact, lead.niche, lead.source, lead.message]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    })
  }, [leads, query, status])

  const metrics = useMemo(() => {
    const count = (value: string) => leads.filter((lead) => lead.status === value).length
    return {
      total: leads.length,
      new: count("new"),
      qualified: count("qualified"),
      won: count("won"),
    }
  }, [leads])

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/business" className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04]" aria-label="Back"><ArrowLeft className="size-4" /></Link>
            <div>
              <div className="font-semibold">Malik Business Lead OS</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-600"><ShieldCheck className="size-3" /> owner: {ownerEmail}</div>
            </div>
          </div>
          <button onClick={loadLeads} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 disabled:opacity-50"><RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [String(metrics.total), "Всего лидов"],
            [String(metrics.new), "Новые"],
            [String(metrics.qualified), "Квалифицированы"],
            [String(metrics.won), "Выиграно"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-3xl border border-white/10 bg-zinc-950 p-6"><div className="text-3xl font-semibold tracking-tight">{value}</div><div className="mt-2 text-xs text-zinc-600">{label}</div></div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-white/10 bg-zinc-950 p-4 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по компании, контакту, нише…" className="w-full rounded-2xl border border-white/10 bg-black py-3 pl-11 pr-4 text-sm outline-none focus:border-white/20" /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm outline-none">
            <option value="all">Все статусы</option>
            {statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {error && <div className="mt-6 rounded-3xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300">Не удалось загрузить CRM: {error}. Проверь Supabase schema и переменные окружения.</div>}

        <div className="mt-6 space-y-4">
          {!loading && !error && filtered.length === 0 && <div className="rounded-3xl border border-white/10 bg-zinc-950 p-10 text-center text-sm text-zinc-600">Лидов пока нет.</div>}
          {filtered.map((lead) => (
            <article key={lead.id} className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{lead.company}</h2>
                    <span className="rounded-full border border-white/10 bg-black px-2.5 py-1 text-[11px] text-zinc-400">{lead.niche}</span>
                    <span className="rounded-full bg-blue-400/10 px-2.5 py-1 text-[11px] text-blue-300">{lead.source || "unknown"}</span>
                  </div>
                  <div className="mt-2 text-sm text-zinc-400">{lead.name} · {lead.contact}</div>
                  {lead.message && <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-500">{lead.message}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {lead.contact?.includes("@") && <a href={`mailto:${lead.contact}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300"><Mail className="size-3.5" /> Email</a>}
                    {lead.website && <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300"><ExternalLink className="size-3.5" /> Website</a>}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:w-[320px]">
                  <label className="grid gap-1.5 text-[11px] uppercase tracking-wider text-zinc-600">Status<select disabled={saving === lead.id} value={lead.status || "new"} onChange={(e) => patchLead(lead.id, { status: e.target.value })} className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm normal-case tracking-normal text-zinc-200 outline-none">{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[11px] uppercase tracking-wider text-zinc-600">Priority<select disabled={saving === lead.id} value={lead.priority || "normal"} onChange={(e) => patchLead(lead.id, { priority: e.target.value })} className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm normal-case tracking-normal text-zinc-200 outline-none">{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <div className="sm:col-span-2 text-right text-[11px] text-zinc-700">{lead.created_at ? new Date(lead.created_at).toLocaleString("ru-RU") : ""}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
