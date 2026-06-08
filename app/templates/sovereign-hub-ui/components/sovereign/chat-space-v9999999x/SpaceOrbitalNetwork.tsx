"use client";

import React from "react";
import type { MalikSpaceMode } from "./MalikSpaceV9999999X";

export function SpaceOrbitalNetwork({ mode = "omega" }: { mode?: MalikSpaceMode }) {
  const isOmega = mode === "omega";

  return (
    <div className="malik-space-x__orbital">
      <span className="malik-space-x__ring malik-space-x__ring--a" />
      <span className="malik-space-x__ring malik-space-x__ring--b" />
      <span className="malik-space-x__ring malik-space-x__ring--c" />
      <span className="malik-space-x__ring malik-space-x__ring--d" />
      <span className="malik-space-x__pulse malik-space-x__pulse--a" />
      <span className="malik-space-x__pulse malik-space-x__pulse--b" />
      <span className="malik-space-x__pulse malik-space-x__pulse--c" />
      {isOmega && (
        <>
          <span className="malik-space-x__scan malik-space-x__scan--a" />
          <span className="malik-space-x__scan malik-space-x__scan--b" />
          <span className="malik-space-x__scan malik-space-x__scan--c" />
        </>
      )}
    </div>
  );
}

export default SpaceOrbitalNetwork;
