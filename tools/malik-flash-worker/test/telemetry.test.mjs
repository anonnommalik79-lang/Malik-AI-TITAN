import assert from "node:assert/strict";
import test from "node:test";
import { flashLatency } from "../telemetry.mjs";

test("latency omits unavailable metrics and reports bounded samples by task", () => {
  const latency = flashLatency();
  assert.deepEqual(latency.snapshot(), {});
  for (let sample = 1; sample <= 240; sample++) latency.record("chat", { completedMs: sample, firstContentMs: sample / 2 });
  latency.record("image_generate", { completedMs: 12_456 });
  assert.deepEqual(latency.snapshot().chat.completedMs, { samples: 200, p50: 140, p95: 230 });
  assert.deepEqual(latency.snapshot().image_generate, { completedMs: { samples: 1, p50: 12_456, p95: 12_456 } });
  assert.equal(latency.snapshot().image_generate.firstContentMs, undefined);
});
