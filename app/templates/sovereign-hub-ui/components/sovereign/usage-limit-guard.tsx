"use client"

import { type ReactNode } from "react"
import { canUseGeneration, type GenerationLimitType } from "@/lib/usage-limits"
import { ProUpgradeCard } from "./pro-upgrade-card"

interface UsageLimitGuardProps {
  type: GenerationLimitType
  userEmail?: string
  children: ReactNode
}

export function UsageLimitGuard({ type, userEmail, children }: UsageLimitGuardProps) {
  if (!canUseGeneration(type, userEmail)) {
    return <ProUpgradeCard />
  }

  return <>{children}</>
}

export default UsageLimitGuard

