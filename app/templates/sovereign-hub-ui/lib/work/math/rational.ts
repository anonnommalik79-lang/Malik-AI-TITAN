/**
 * Exact rational numbers on BigInt, for the parts of the math engine that
 * must not round: quadratic formulas, polynomial integrals, linear systems
 * with rational coefficients. Small on purpose — no general CAS.
 *
 * (The project targets ES6, so BigInt literals are written as BigInt(n).)
 */

export type Q = { n: bigint; d: bigint }

const B0 = BigInt(0)
const B1 = BigInt(1)
const B2 = BigInt(2)

function gcd(a: bigint, b: bigint): bigint {
  let x = a < B0 ? -a : a
  let y = b < B0 ? -b : b
  while (y !== B0) {
    const rest = x % y
    x = y
    y = rest
  }
  return x
}

export function q(n: bigint | number, d: bigint | number = B1): Q {
  let num = BigInt(n)
  let den = BigInt(d)
  if (den === B0) throw new RangeError("division by zero")
  if (den < B0) { num = -num; den = -den }
  const g = gcd(num, den) || B1
  return { n: num / g, d: den / g }
}

export const ZERO = q(0)
export const ONE = q(1)

export const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d)
export const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d)
export const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d)
export const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n)
export const neg = (a: Q) => q(-a.n, a.d)
export const isZero = (a: Q) => a.n === B0
export const sign = (a: Q) => (a.n > B0 ? 1 : a.n < B0 ? -1 : 0)
export const toNumber = (a: Q) => Number(a.n) / Number(a.d)

export function pow(a: Q, exponent: number): Q {
  let result = ONE
  for (let index = 0; index < exponent; index += 1) result = mul(result, a)
  return result
}

export function toText(a: Q): string {
  return a.d === B1 ? a.n.toString() : `${a.n}/${a.d}`
}

/**
 * The rational a float stands for, when it stands for one exactly enough:
 * 0.5 → 1/2, 0.3333333333333333 → 1/3. Continued fractions up to a
 * denominator limit; null when nothing small fits.
 */
export function fromNumber(value: number, maxDenominator = 1_000_000): Q | null {
  if (!Number.isFinite(value)) return null
  if (Number.isInteger(value)) return Math.abs(value) <= Number.MAX_SAFE_INTEGER ? q(BigInt(value)) : null
  const negative = value < 0
  const target = Math.abs(value)
  let x = target
  let h0 = B0
  let h1 = B1
  let k0 = B1
  let k1 = B0
  for (let step = 0; step < 40; step += 1) {
    const whole = Math.floor(x)
    const a = BigInt(whole)
    const h2 = a * h1 + h0
    const k2 = a * k1 + k0
    h0 = h1; h1 = h2; k0 = k1; k1 = k2
    if (k1 > BigInt(maxDenominator)) return null
    const approx = Number(h1) / Number(k1)
    if (Math.abs(approx - target) <= 1e-12 * target) return q(negative ? -h1 : h1, k1)
    const rest = x - whole
    if (rest < 1e-15) break
    x = 1 / rest
  }
  return null
}

export function isqrt(value: bigint): bigint {
  if (value < B0) throw new RangeError("negative")
  if (value < B2) return value
  let x = BigInt(Math.floor(Math.sqrt(Number(value))))
  while (x * x > value) x -= B1
  while ((x + B1) * (x + B1) <= value) x += B1
  return x
}

/** √m = k·√rest with rest square-free; null for numbers too large to factor quickly. */
export function simplifySqrt(m: bigint): { k: bigint; rest: bigint } | null {
  if (m < B0 || m > BigInt(1_000_000_000_000)) return null
  let k = B1
  let rest = m
  for (let p = B2; p * p <= rest; p += B1) {
    while (rest % (p * p) === B0) {
      rest /= p * p
      k *= p
    }
  }
  return { k, rest }
}

/** The exact square root of a non-negative rational: coefficient·√radicand. */
export function sqrtQ(value: Q): { coefficient: Q; radicand: bigint } | null {
  if (value.n < B0) return null
  const simplified = simplifySqrt(value.n * value.d)
  if (!simplified) return null
  return { coefficient: q(simplified.k, value.d), radicand: simplified.rest }
}
