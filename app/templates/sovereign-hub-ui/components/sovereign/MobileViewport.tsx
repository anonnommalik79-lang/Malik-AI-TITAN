"use client"

import { useEffect } from "react"
import { observeMobileViewport } from "@/lib/mobile-viewport"

export function MobileViewport() {
  useEffect(() => observeMobileViewport(), [])
  return null
}
