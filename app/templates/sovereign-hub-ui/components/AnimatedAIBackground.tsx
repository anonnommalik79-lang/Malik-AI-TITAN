"use client"

import { SpaceBackground } from "./space-bg/SpaceBackground"

/**
 * AnimatedAIBackground
 * ====================
 * Backwards-compatible entry point. The full "open space" background has been
 * refactored into a modular system under `components/space-bg/`, with one
 * file per feature (deep space, ultra star field, shooting stars, auroras,
 * galactic core, atmosphere horizon, cinematic overlays).
 *
 * The dashboard still imports `AnimatedAIBackground`, so this thin wrapper
 * keeps that contract while delegating to the new composer.
 */
export function AnimatedAIBackground() {
  return <SpaceBackground />
}

export default AnimatedAIBackground
