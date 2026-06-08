"use client";

import React from "react";
import type { MalikSpaceMode } from "./MalikSpaceV9999999X";

export function SpaceHorizonCore({ mode = "omega" }: { mode?: MalikSpaceMode }) {
  return (
    <div className={`malik-space-x__horizon malik-space-x__horizon--${mode}`}>
      <span className="malik-space-x__planet" />
      <span className="malik-space-x__atmosphere-line" />
      <span className="malik-space-x__ion-blue" />
      <span className="malik-space-x__aurora malik-space-x__aurora--a" />
      <span className="malik-space-x__aurora malik-space-x__aurora--b" />
      <span className="malik-space-x__aurora malik-space-x__aurora--c" />
    </div>
  );
}

export default SpaceHorizonCore;
