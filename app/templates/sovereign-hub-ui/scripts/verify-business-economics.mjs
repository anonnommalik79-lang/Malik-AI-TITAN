// node --experimental-strip-types scripts/verify-business-economics.mjs
import assert from "node:assert/strict"
import { calculateEconomics as calculate } from "../lib/business/economics.ts"

assert.deepEqual(calculate({ price: 100, variable: 40, fixed: 600, volume: 20, cash: 1200 }), {
  contribution: 60, revenue: 2000, operatingResult: 600, breakEvenUnits: 10, runwayMonths: null,
})
assert.equal(calculate({ price: 40, variable: 40, fixed: 600, volume: 20, cash: 1200 }).breakEvenUnits, null)
assert.equal(calculate({ price: 40, variable: 40, fixed: 600, volume: 20, cash: 1200 }).runwayMonths, 2)
assert.equal(calculate({ price: 100, variable: 40, fixed: 601, volume: 0, cash: 0 }).breakEvenUnits, 11)
for (const price of [-1, NaN, Infinity, 1e13]) {
  assert.equal(calculate({ price, variable: 0, fixed: 0, volume: 0, cash: 0 }), null)
}
assert.equal(calculate({ price: 0, variable: 0, fixed: 0, volume: 0, cash: 0 }).operatingResult, 0)
console.log("Business economics: 9 assertions passed")
