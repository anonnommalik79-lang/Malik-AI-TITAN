"use client"

import { useEffect } from "react"
import { startRequestMotionKeeper } from "@/lib/ui/request-motion-keeper"

/** Keeps the request spinners turning on phones where CSS motion is frozen. */
export function RequestMotionKeeper() {
  useEffect(() => startRequestMotionKeeper(), [])
  return null
}

export default RequestMotionKeeper
