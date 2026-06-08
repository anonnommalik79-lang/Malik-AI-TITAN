"use client"

import { ShieldCheck, Wrench } from "lucide-react"

export type UsageBypassBadgeProps = {
  status?: {
    admin?: boolean
    devBypass?: boolean
    canBypass?: boolean
    label?: string
    message?: string
  } | null
}

export function UsageBypassBadge({ status }: UsageBypassBadgeProps) {
  if (!status?.canBypass) return null

  const Icon = status.admin ? ShieldCheck : Wrench

  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-100">
      <div className="flex items-center gap-2 text-sm font-black">
        <Icon className="h-4 w-4" />
        {status.label || (status.admin ? "Admin mode active" : "Dev bypass limits enabled")}
      </div>
      <p className="mt-1 text-xs text-emerald-200/80">
        {status.message || (status.admin ? "All limits unlocked for owner." : "Limits disabled only in development.")}
      </p>
    </div>
  )
}

export default UsageBypassBadge

