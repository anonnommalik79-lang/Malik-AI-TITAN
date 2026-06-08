type AnyFn = (...args: never[]) => void

export function debounce<T extends AnyFn>(fn: T, waitMs: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, waitMs)
  }) as T & { cancel: () => void }

  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return debounced
}

export function throttle<T extends AnyFn>(fn: T, waitMs: number): T & { flush: () => void; cancel: () => void } {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: Parameters<T> | null = null

  const run = () => {
    if (!pendingArgs) return
    const args = pendingArgs
    pendingArgs = null
    last = Date.now()
    fn(...args)
  }

  const throttled = ((...args: Parameters<T>) => {
    pendingArgs = args
    const elapsed = Date.now() - last
    if (elapsed >= waitMs) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      run()
      return
    }
    if (!timer) {
      timer = setTimeout(() => {
        timer = null
        run()
      }, waitMs - elapsed)
    }
  }) as T & { flush: () => void; cancel: () => void }

  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    run()
  }

  throttled.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pendingArgs = null
  }

  return throttled
}

export function scheduleIdle(task: () => void, timeoutMs = 1200): void {
  if (typeof window === "undefined") {
    task()
    return
  }

  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  if (typeof ric === "function") {
    ric(() => task(), { timeout: timeoutMs })
    return
  }

  window.setTimeout(task, 0)
}
