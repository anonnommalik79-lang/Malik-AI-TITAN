import robotsParser from "robots-parser";

export const GOOGLE_HOME = "https://www.google.com/ai";
const AI_RESULTS = "https://www.google.com/search?udm=50";
const ROBOTS = "https://www.google.com/robots.txt";
const ROBOT_AGENT = "MALIKIIFlash";
const CACHE_MS = 5 * 60_000;
const MAX_ROBOTS_BYTES = 512 * 1024;

export class GoogleAccessError extends Error {
  constructor() {
    super("Автоматический доступ к Google AI Mode сейчас недоступен.");
    this.code = "GOOGLE_AUTOMATION_RESTRICTED";
    this.status = 503;
  }
}

async function loadRobots(fetcher) {
  const response = await fetcher(ROBOTS, { redirect: "error", signal: AbortSignal.timeout(4000), headers: { "user-agent": ROBOT_AGENT } });
  if (!response.ok || !response.body) throw new GoogleAccessError();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "", size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ROBOTS_BYTES) throw new GoogleAccessError();
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    if (!/^user-agent\s*:/im.test(text)) throw new GoogleAccessError();
    return robotsParser(ROBOTS, text);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function googleAccess(fetcher = fetch) {
  let cached, refreshing;
  return async (target = AI_RESULTS) => {
    try {
      const url = new URL(target);
      if (url.origin !== new URL(ROBOTS).origin || url.username || url.password) throw new GoogleAccessError();
      if (!cached || cached.until <= Date.now()) {
        refreshing ||= loadRobots(fetcher).then(rules => { cached = { rules, until: Date.now() + CACHE_MS }; })
          .finally(() => { refreshing = undefined; });
        await refreshing;
      }
      if (cached.rules.isAllowed(AI_RESULTS, ROBOT_AGENT) !== true ||
          cached.rules.isAllowed(url.href, ROBOT_AGENT) !== true) throw new GoogleAccessError();
    } catch {
      throw new GoogleAccessError();
    }
  };
}
