"use client";

import { useState } from "react";
import { useMalikResearch } from "../../hooks/useMalikResearch";
import { LiveResearchActivity } from "./LiveResearchActivity";
import { ResearchMarkdown } from "./ResearchMarkdown";

export function ResearchLab() {
  const [message, setMessage] = useState(
    "найди актуальные AI хакатоны, конкурсы и акселераторы в Казахстане и онлайн для MALIK AI 2026"
  );

  const research = useMalikResearch();

  async function submit() {
    if (!message.trim() || research.active) return;
    await research.run(message.trim());
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row">
        <section className="min-w-0 flex-1">
          <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black">
            <div className="mb-2 text-sm uppercase tracking-[0.25em] text-white/35">
              MALIK AI
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Live Internet Research Mode
            </h1>
            <p className="mt-3 max-w-3xl text-white/55">
              Свежий поиск по открытым источникам, чтение страниц, кэширование и
              ответ с источниками. По умолчанию почти без траты AI API токенов.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black px-4 text-white outline-none placeholder:text-white/25 focus:border-white/30"
                placeholder="Спроси про свежие события, конкурсы, новости..."
              />

              <button
                onClick={submit}
                disabled={research.active}
                className="rounded-2xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {research.active ? "Ищу..." : "Запустить"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
            {research.answer ? (
              <ResearchMarkdown text={research.answer} />
            ) : (
              <div className="py-16 text-center text-white/35">
                Запусти Live Research — здесь появится ответ с источниками.
              </div>
            )}
          </div>
        </section>

        <div className="lg:sticky lg:top-6 lg:h-fit">
          <LiveResearchActivity
            active={research.active}
            steps={research.steps}
            sources={research.sources}
            webSourceCount={research.webSourceCount}
            cached={research.cached}
          />
        </div>
      </div>
    </main>
  );
}
