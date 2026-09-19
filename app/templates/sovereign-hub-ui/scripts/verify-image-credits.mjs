import assert from "node:assert/strict"
import fs from "node:fs"

const read = (path) => fs.readFileSync(path, "utf8")

const provider = read("lib/media/providers/agnes-image.ts")
const limits = read("lib/media/limits.ts")
const route = read("lib/media/generate-photo-route.ts")
const api = read("app/api/ai/image/route.ts")
const mediaApi = read("app/api/media/image/route.ts")
const credits = read("app/api/ai/image/credits/route.ts")
const chat = read("components/sovereign/chat-view.tsx")
const dashboard = read("components/sovereign/dashboard.tsx")
const studio = read("components/sovereign/photo-generation/PhotoGenerationStudio.tsx")

assert.match(provider, /AGNES_API_KEY_1/)
assert.match(provider, /AGNES_API_KEY_2/)
assert.match(provider, /AGNES_API_KEY_3/)
assert.match(provider, /AGNES_RATE_LIMITED/)
assert.match(provider, /agnes-image-2\.1-flash/)
assert.match(provider, /extra_body:\s*\{ response_format: "url" \}/)

assert.match(limits, /IMAGE_DAILY_CREDITS/)
assert.match(limits, /IMAGE_COST_1K/)
assert.match(limits, /IMAGE_COST_2K/)
assert.match(limits, /IMAGE_COST_4K/)
assert.match(limits, /IMAGE_MAX_4K_PER_DAY/)
assert.match(limits, /recordImageCreditUsage/)

assert.match(route, /generateWithAgnesImage/)
assert.match(route, /remainingImageCredits/)
assert.match(route, /imageCreditCost/)
assert.match(api, /handleMalikPhotoGenerationRequest/)
assert.match(mediaApi, /handleMalikPhotoGenerationRequest/)
assert.match(credits, /getImageCreditStatus/)

assert.match(chat, /Да, создать изображение/)
assert.match(chat, /\["1K", "2K", "4K"\]/)
assert.match(chat, /Фото-кредиты:/)
assert.match(chat, /malik-image-credits-changed/)
assert.match(dashboard, /imageSize:\s*inlineMediaKind === "image"/)
assert.match(dashboard, /action: "confirm" \| "cancel" \| "generate"/)
assert.match(studio, /IMAGE_SIZES/)
assert.match(studio, /remainingImageCredits/)

console.log("Agnes image credits + resolution flow verified.")
