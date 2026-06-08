"use client";

import React from "react";
import type { MalikSpaceMode } from "./MalikSpaceV9999999X";

const counts = {
  clean: 4,
  nasa: 7,
  titan: 10,
  omega: 14,
} as const;

export function SpaceAsteroidBelt({ mode = "omega" }: { mode?: MalikSpaceMode }) {
  return (
    <div className="malik-space-x__asteroids">
      {Array.from({ length: counts[mode] }, (_, index) => (
        <span key={index} className={`malik-space-x-rock malik-space-x-rock--${index + 1}`} />
      ))}
    </div>
  );
}

export default SpaceAsteroidBelt;
