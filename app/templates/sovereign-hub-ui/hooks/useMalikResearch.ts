"use client";

import { useCallback, useRef, useState } from "react";

export type MalikResearchSource = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  publishedAt?: string;
};

export type MalikResearchStep = {
  type: string;
  text: string;
  domain?: string;
  at: number;
};

export function useMalikResearch() {
  const [active, setActive] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<MalikResearchSource[]>([]);
  const [steps, setSteps] = useState<MalikResearchStep[]>([]);
  const [webSourceCount, setWebSourceCount] = useState(0);
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addStep = useCallback((type: string, data: Record<string, unknown>) => {
    setSteps((prev) =>
      [
        ...prev,
        {
          type,
          text: String(data?.text || ""),
          domain: typeof data?.domain === "string" ? data.domain : undefined,
          at: Number(data?.at || Date.now()),
        },
      ].slice(-60)
    );
  }, []);

  const run = useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setActive(true);
      setAnswer("");
      setSources([]);
      setSteps([]);
      setWebSourceCount(0);
      setCached(false);

      const res = await fetch("/api/malik-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setActive(false);
        throw new Error("MALIK Research API failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const raw of events) {
          const eventLine = raw.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));

          if (!eventLine || !dataLine) continue;

          const event = eventLine.replace("event:", "").trim();

          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(dataLine.replace("data:", "").trim());
          } catch {
            data = {};
          }

          if (event === "answer") {
            setAnswer(String(data.answer || ""));
            setSources(Array.isArray(data.sources) ? (data.sources as MalikResearchSource[]) : []);
            setWebSourceCount(Number(data.webSourceCount || 0));
            setCached(Boolean(data.cached));
          } else {
            addStep(event, data);
          }
        }
      }

      setActive(false);
    },
    [addStep]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setActive(false);
  }, []);

  return {
    active,
    answer,
    sources,
    steps,
    webSourceCount,
    cached,
    run,
    stop,
  };
}
