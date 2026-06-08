export type RetryPolicy = {
  attempts: number
  baseDelayMs: number
  factor: number
  jitter: boolean
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 550,
  factor: 1.7,
  jitter: true,
}

export async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function retryWithPolicy<T>(
  task: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
) {
  let lastError: unknown
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    try {
      return await task(attempt)
    } catch (error) {
      lastError = error
      if (attempt < policy.attempts) {
        const jitter = policy.jitter ? Math.random() * 120 : 0
        await wait(policy.baseDelayMs * Math.pow(policy.factor, attempt - 1) + jitter)
      }
    }
  }
  throw lastError
}

