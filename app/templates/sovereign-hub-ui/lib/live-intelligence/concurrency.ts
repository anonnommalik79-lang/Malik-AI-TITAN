export async function mapBounded<T, R>(items: readonly T[], parallelism: number, run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      try { results[index] = { status: "fulfilled", value: await run(items[index]) } }
      catch (reason) { results[index] = { status: "rejected", reason } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, parallelism)) }, worker))
  return results
}
