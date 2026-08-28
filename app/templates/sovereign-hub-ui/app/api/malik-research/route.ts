import { runResearch } from "../../../lib/malik-research/research";

import { withCompute } from "@/lib/malik-compute/runtime"
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST = withCompute(handlePOST, "research")

async function handlePOST(req: Request) {
  const encoder = new TextEncoder();
  let message = "";

  try {
    const body = await req.json();
    message = String(body.message || "").trim();
  } catch {
    message = "";
  }

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: Record<string, unknown>) => {
        if (cancelled) return;
        controller.enqueue(
          encoder.encode(
            sse(event, {
              ...data,
              at: Date.now(),
            })
          )
        );
      };

      try {
        const result = await runResearch(message, emit);
        emit("answer", result as unknown as Record<string, unknown>);
        emit("done", { text: "Done" });
      } catch (error) {
        emit("error", {
          text: error instanceof Error ? error.message : "Research failed",
        });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
