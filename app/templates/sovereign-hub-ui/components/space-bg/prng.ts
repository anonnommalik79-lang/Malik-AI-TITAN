/**
 * Deterministic pseudo-random number generator utilities for the
 * Malik AI "open space" background system.
 *
 * Why deterministic?
 * ------------------
 * The background is rendered both on the server (SSR) and on the client.
 * If we used `Math.random()` the server HTML and the client HTML would not
 * match, producing a React hydration error. By seeding a deterministic
 * generator we guarantee that every star, comet and dust mote lands in the
 * exact same place on both passes — zero hydration mismatch, NASA-grade
 * repeatability.
 */

/**
 * mulberry32 — a tiny, fast, high-quality 32-bit PRNG.
 * Returns a function producing floats in the [0, 1) range.
 */
export function mulberry32(seed: number): () => number {
  let state = seed | 0
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seeded random helper bundle with convenience methods. */
export interface SeededRandom {
  /** Raw float in [0, 1). */
  next: () => number
  /** Float in [min, max). */
  range: (min: number, max: number) => number
  /** Integer in [min, max] inclusive. */
  int: (min: number, max: number) => number
  /** Boolean true with the given probability (0..1). */
  chance: (probability: number) => boolean
  /** Pick a random element from an array. */
  pick: <T>(items: readonly T[]) => T
  /**
   * Float in [0, 1) biased toward 0 by raising to the given power.
   * power > 1 → more small values (great for star sizes: many tiny, few huge).
   */
  biasLow: (power: number) => number
}

export function createSeededRandom(seed: number): SeededRandom {
  const next = mulberry32(seed)
  const range = (min: number, max: number) => min + next() * (max - min)
  const int = (min: number, max: number) => Math.floor(range(min, max + 1))
  const chance = (probability: number) => next() < probability
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]
  const biasLow = (power: number) => Math.pow(next(), power)
  return { next, range, int, chance, pick, biasLow }
}

/**
 * Round a number to a fixed number of decimals and return it as a string.
 * Keeping a stable string representation also keeps SSR/CSR markup identical.
 */
export function fixed(value: number, decimals = 2): string {
  return value.toFixed(decimals)
}
