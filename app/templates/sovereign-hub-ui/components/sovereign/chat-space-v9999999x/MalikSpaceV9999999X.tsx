"use client";

import React from "react";
import { SpaceDeepCanvas } from "./SpaceDeepCanvas";
import { SpaceFleetLayer } from "./SpaceFleetLayer";
import { SpaceOrbitalNetwork } from "./SpaceOrbitalNetwork";
import { SpaceHorizonCore } from "./SpaceHorizonCore";
import { SpaceAsteroidBelt } from "./SpaceAsteroidBelt";
import "./malik-space-v9999999x.css";

export type MalikSpaceMode = "clean" | "nasa" | "titan" | "omega";

export type MalikSpaceV9999999XProps = {
  /**
   * Recommended:
   * active={messages.length > 0}
   * So it appears only after first AI-chat request.
   */
  active?: boolean;
  mode?: MalikSpaceMode;
  className?: string;
};

export function MalikSpaceV9999999X({
  active = true,
  mode = "omega",
  className = "",
}: MalikSpaceV9999999XProps) {
  if (!active) return null;

  return (
    <div
      className={`malik-space-x malik-space-x--${mode} ${className}`}
      aria-hidden="true"
      data-malik-space="v9999999x"
    >
      <div className="malik-space-x__void" />
      <div className="malik-space-x__nebula-a" />
      <div className="malik-space-x__nebula-b" />
      <SpaceDeepCanvas mode={mode} />
      <SpaceOrbitalNetwork mode={mode} />
      <SpaceAsteroidBelt mode={mode} />
      <SpaceFleetLayer mode={mode} />
      <SpaceHorizonCore mode={mode} />
      <div className="malik-space-x__grain" />
      <div className="malik-space-x__cinema-vignette" />
    </div>
  );
}

export default MalikSpaceV9999999X;
