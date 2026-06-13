"use client";

import type { ReactNode } from "react";

type Props = {
  text: string;
};

function renderInline(input: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;

  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input))) {
    if (match.index > last) parts.push(input.slice(last, match.index));

    if (match[1] && match[2]) {
      parts.push(
        <a
          key={`${match.index}-${match[2]}`}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-white/30 underline-offset-4 hover:decoration-white"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      parts.push(
        <strong key={`${match.index}-${match[3]}`} className="font-semibold text-white">
          {match[3]}
        </strong>
      );
    }

    last = regex.lastIndex;
  }

  if (last < input.length) parts.push(input.slice(last));
  return parts;
}

export function ResearchMarkdown({ text }: Props) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div className="space-y-3 text-[15px] leading-7 text-white/80">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) return <div key={index} className="h-2" />;

        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={index} className="mt-7 text-xl font-bold text-white">
              {trimmed.replace(/^##\s+/, "")}
            </h2>
          );
        }

        if (trimmed.startsWith("|")) {
          return (
            <pre key={index} className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
              {trimmed}
            </pre>
          );
        }

        return <p key={index}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}
