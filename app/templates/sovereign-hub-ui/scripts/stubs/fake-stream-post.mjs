// Stand-in for app/api/stream/route POST: a model stream the test controls.
// It writes what the test queues, and records how it was stopped.
export async function POST(request) {
  const run = { requestAborted: false, cancelled: false, closed: false }
  ;(globalThis.__malikFakeRuns ||= []).push(run)
  request.signal.addEventListener("abort", () => { run.requestAborted = true }, { once: true })
  const plan = globalThis.__malikFakePlan || { chunks: [], hold: true }
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for (const frame of plan.chunks) controller.enqueue(encoder.encode(frame))
      if (!plan.hold) { run.closed = true; controller.close() }
    },
    cancel() { run.cancelled = true },
  })
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } })
}
