import assert from "node:assert/strict"
import { calculateUnitEconomics, economicsMarkdown, parseEconomicsInputs } from "../lib/business/unit-economics.ts"
import { directMediaUrl } from "../lib/os/media-reference.ts"

const inputs = parseEconomicsInputs({ currency: "KZT", price: 1000, variableCost: 200, monthlyCustomers: 100, monthlyFixedCosts: 40000, monthlyMarketingSpend: 10000, newCustomers: 20, monthlyChurnPercent: 10 })
const result = calculateUnitEconomics(inputs)
assert.equal(result.monthlyRevenue, 100000)
assert.equal(result.contributionPerCustomer, 800)
assert.equal(result.grossMarginPercent, 80)
assert.equal(result.monthlyProfit, 40000)
assert.equal(result.cac, 500)
assert.equal(result.ltv, 8000)
assert.equal(result.ltvToCac, 16)
assert.equal(result.breakEvenCustomers, 50)
assert.deepEqual(result.pricingScenarios.map((row) => row.price), [900, 1000, 1100])
assert.match(economicsMarkdown(result), /не прогнозируют|не прогноз|не подтверждённые|не подтвержденные|не подтверждённые показатели/)

const missing = calculateUnitEconomics(parseEconomicsInputs({ price: 1200 }))
assert.equal(missing.monthlyRevenue, null)
assert.equal(missing.cac, null)
assert.equal(missing.ltv, null)
assert.ok(missing.missing.includes("monthlyCustomers"))
assert.match(economicsMarkdown(missing), /Нет данных/)
assert.throws(() => parseEconomicsInputs({ price: -1 }))
assert.throws(() => parseEconomicsInputs({ monthlyChurnPercent: 101 }))
assert.throws(() => parseEconomicsInputs({ currency: "???" }))

assert.equal(directMediaUrl("https://cdn.example.com/video.mp4", "https://malikaiworld.world"), "https://cdn.example.com/video.mp4")
assert.equal(directMediaUrl("https://malikaiworld.world/api/media/video/file", "https://malikaiworld.world"), null)
assert.equal(directMediaUrl("http://cdn.example.com/video.mp4"), null)
assert.equal(directMediaUrl("https://127.0.0.1/file.mp4"), null)
assert.equal(directMediaUrl("https://user:secret@cdn.example.com/file.mp4"), null)
assert.equal(directMediaUrl("data:video/mp4;base64,AAAA"), null)

console.log("creation engine: economics and direct media references passed")
