"use client"

import { useEffect, useRef, useCallback } from "react"
import { throttle } from "@/lib/perf-scheduler"
import type { ThinkingStep } from "@/lib/ai/safe-thinking"
import { streamStore } from "@/lib/stream-store"

const STREAM_UI_MS = 130

export function useStreamingChat() {
  const streamUiThrottleRef = useRef<ReturnType<typeof throttle<(text: string, msgId: string) => void>> | null>(null)

  useEffect(() => {
    streamUiThrottleRef.current = throttle((text: string, msgId: string) => {
      streamStore.update(text, msgId)
    }, STREAM_UI_MS)

    return () => {
      streamUiThrottleRef.current?.cancel()
      streamUiThrottleRef.current = null
    }
  }, [])

  const beginStream = useCallback((messageId: string) => {
    streamStore.begin(messageId)
  }, [])

  const pushStream = useCallback((text: string, messageId: string) => {
    streamUiThrottleRef.current?.(text, messageId)
  }, [])

  const flushStream = useCallback(() => {
    streamUiThrottleRef.current?.flush()
  }, [])

  const endStream = useCallback(() => {
    streamUiThrottleRef.current?.flush()
    streamStore.end()
  }, [])

  const updateThinking = useCallback(
    (
      messageId: string,
      input: Partial<{
        thinkingLabel: string
        thinkingSteps: ThinkingStep[]
        providerUsed: string
        safeMode: boolean
        fallbackUsed: boolean
      }>,
    ) => {
      streamStore.updateThinking(messageId, input)
    },
    [],
  )

  return { beginStream, pushStream, flushStream, endStream, updateThinking }
}
