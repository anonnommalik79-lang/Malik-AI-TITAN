"use client";

import React from "react";
import type { MalikSpaceMode } from "./MalikSpaceV9999999X";

const countByMode = {
  clean: 1,
  nasa: 2,
  titan: 3,
  omega: 5,
} as const;

const assets = [
  "/space-v9999999x/probe-x.svg",
  "/space-v9999999x/satellite-x.svg",
  "/space-v9999999x/station-x.svg",
  "/space-v9999999x/probe-x.svg",
  "/space-v9999999x/satellite-x.svg",
];

export function SpaceFleetLayer({ mode = "omega" }: { mode?: MalikSpaceMode }) {
  const count = countByMode[mode];

  return (
    <div className="malik-space-x__fleet">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={`malik-space-x-ship malik-space-x-ship--${index + 1}`}>
          <img src={assets[index]} alt="" draggable={false} />
          <i />
        </span>
      ))}
    </div>
  );
}

export default SpaceFleetLayer;
