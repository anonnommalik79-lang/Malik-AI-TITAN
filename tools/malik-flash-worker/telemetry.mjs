const MAX_SAMPLES = 200;
const fields = ["queueMs", "browserPreparationMs", "submitMs", "firstContentMs", "completedMs"];

export function flashLatency() {
  const samples = new Map();
  return {
    record(task, timing) {
      if (!timing || !["chat", "image_understanding", "image_generate", "image_edit"].includes(task)) return;
      let recent = samples.get(task);
      if (!recent) {
        recent = [];
        samples.set(task, recent);
      }
      recent.push(timing);
      if (recent.length > MAX_SAMPLES) recent.shift();
    },
    snapshot() {
      return Object.fromEntries([...samples].map(([task, recent]) => [
        task, Object.fromEntries(fields.flatMap(field => {
          const times = recent.map(sample => sample[field]).filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
          if (!times.length) return [];
          const at = percentile => times[Math.ceil(percentile * times.length) - 1];
          return [[field, { samples: times.length, p50: at(0.5), p95: at(0.95) }]];
        })),
      ]));
    },
  };
}
