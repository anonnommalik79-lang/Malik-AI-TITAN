import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import sharp from 'sharp'

// Execute production modules; substitute only infrastructure at module edges.
const require = createRequire(import.meta.url)
function load(file, stubs = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  const resolveModuleFile = (base) => {
    const candidates = [
      base,
      base + '.ts',
      base + '.tsx',
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ]
    return candidates.find((candidate) => fs.existsSync(candidate))
  }
  const resolve = (name) => {
    if (name === 'server-only') return {}
    if (Object.hasOwn(stubs, name)) return stubs[name]
    if (name.startsWith('@/')) {
      const resolved = resolveModuleFile(path.resolve(process.cwd(), name.slice(2)))
      if (!resolved) throw new Error(`Cannot resolve app alias module: ${name}`)
      return load(resolved, stubs)
    }
    if (name.startsWith('.')) {
      const resolved = resolveModuleFile(path.resolve(path.dirname(file), name))
      if (!resolved) throw new Error(`Cannot resolve relative module: ${name} from ${file}`)
      return load(resolved, stubs)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports)
  return module.exports
}

const { isExplicitImageEditRequest: edit, isExplicitImageGenerationRequest: create } = load('lib/ai/image-intent.ts')
for (const prompt of ['убери человека справа', 'добавь кота', 'добавь чёрный спорткар на зелёную траву', 'поставь машину слева', 'вставь человека в кадр', 'размести самолёт рядом с домом', 'перемести авто вправо', 'дорисуй дерево', 'замени фон', 'сделай фон белым', 'смени тут логотип на реал мадрид', 'сделай чтобы тут было логотип барселоны', 'замени эмблему на Real Madrid', 'напиши на фото «С днём рождения!»', 'сгенерируй фото меня на пляже', 'remove the car', 'replace the logo with Barcelona badge', 'insert a black sports car on the lawn', 'change the sky', 'суретке гүл қос']) assert.equal(edit(prompt, true), true, prompt)
for (const prompt of ['что на фото?', 'опиши изображение', 'как убрать человека с фото?', 'напиши код для фото', 'напиши промпт для картинки', 'переведи текст на фото', '/video добавь движение']) assert.equal(edit(prompt, true), false, prompt)
assert.equal(edit('добавь пункт в список'), false)
assert.equal(edit('убери человека на фото'), true)
assert.equal(create('сгенерируй фото кота'), true)

// Creation prompts with layout/lettering words must never demand an upload.
for (const prompt of [
  'сгенерируй фото что там иконка темная и внизу надпись красавчик',
  'сделай фото с логотипом сверху и надписью снизу',
  'создай картинку и добавь текст внизу',
]) {
  assert.equal(create(prompt), true, prompt)
  assert.equal(edit(prompt, false), false, prompt)
}

const dashboardSource = fs.readFileSync('components/sovereign/dashboard.tsx', 'utf8')
assert.match(dashboardSource, /const forcedImageEdit = hasRequestImageAttachment && isExplicitImageEditRequest\(cleanContent, true\)/)
assert.match(dashboardSource, /const requestedInlineMediaKind = forcedImageEdit[\s\S]*?\? "image"/)
assert.match(dashboardSource, /promptLikelyEditsRecentImage/)
assert.match(dashboardSource, /previousUpload/)
assert.match(dashboardSource, /persistChatAttachmentsForHistory/)
assert.match(dashboardSource, /\/api\/chat\/attachment/)
assert.match(dashboardSource, /MALIK_SESSION_MEMORY/)
assert.match(dashboardSource, /MALIK_MEDIA_ACTION_HISTORY/)
assert.match(dashboardSource, /asksAboutMalikMediaActions/)
assert.match(dashboardSource, /buildMalikMediaActionAnswer/)
assert.match(dashboardSource, /Never deny that these actions happened/)
const streamSource = fs.readFileSync('app/api/stream/route-impl.ts', 'utf8')
assert.match(streamSource, /IMAGE_EDIT_ROUTE_REQUIRED/)
assert.match(streamSource, /requiresImageEditPipeline\(body\)/)
assert.match(streamSource, /integrated image generation and image editing/)
assert.match(streamSource, /MALIK_MEDIA_ACTION_FACT/)

const source = load('lib/media/image-edit-source.ts')
const original = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#ee5533' } }).png().toBuffer()
const attachment = { kind: 'image', mime: 'image/png', base64: original.toString('base64') }
const input = { attachments: [attachment] }
const prepared = await source.prepareImageEditSource(input)
assert.equal(prepared.width / prepared.height, 2)
const preparedMeta = await sharp(prepared.bytes).metadata()
assert.equal(preparedMeta.width, 512)
assert.equal(preparedMeta.height, 256)
assert.deepEqual(await source.prepareImageEditSource({ attachments: [{ ...attachment, base64: `data:image/png;base64,${attachment.base64}` }] }), prepared)
for (const attachments of [[], [attachment, attachment], [{ kind: 'image', url: 'http://127.0.0.1/private' }], [{ ...attachment, base64: 'not an image' }], [{ ...attachment, mime: 'image/svg+xml' }]]) await assert.rejects(source.prepareImageEditSource({ attachments }))
await assert.rejects(source.prepareImageEditSource({ attachments: [{ ...attachment, base64: 'A'.repeat(17 * 1024 * 1024) }] }), /12 МБ/)

process.env.CLOUDFLARE_IMAGE_ACCOUNT_ID = 'offline-test'
process.env.CLOUDFLARE_IMAGE_API_TOKEN = 'offline-test'
const provider = load('lib/media/providers/cloudflare-image-prepared.ts')
const savedFetch = globalThis.fetch
let calls = []
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ success: true, result: { image: original.toString('base64') } }) }
try {
  await provider.generatePreparedCloudflareImage({ strictPrompt: 'напиши «Алматы»', negativePrompt: '', modelId: 'flux-klein-4b', editSource: prepared })
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /flux-2-klein-4b$/)
  const form = calls[0].init.body
  assert.ok(form instanceof FormData)
  assert.equal(form.get('prompt'), 'напиши «Алматы»')
  assert.equal(form.get('width'), '1024')
  assert.equal(form.get('height'), '512')
  assert.deepEqual(Buffer.from(await form.get('input_image_0').arrayBuffer()), prepared.bytes)
  await assert.rejects(provider.generatePreparedCloudflareImage({ strictPrompt: 'edit', negativePrompt: '', modelId: 'flux-schnell', editSource: prepared }), /UNSUPPORTED/)
  assert.equal(calls.length, 1)
  await provider.generatePreparedCloudflareImage({ strictPrompt: 'a cat', negativePrompt: '', modelId: 'flux-schnell' })
  assert.equal(JSON.parse(calls[1].init.body).prompt, 'a cat')

  const forbidden = () => { throw new Error('Edit fell into text-only generation') }
  const router = load('lib/media/image-router.ts', {
    './visual-prompt': { buildVisualPrompt: forbidden },
    './providers/pollinations': { generateWithPollinations: forbidden },
    './providers/stability': { generateWithStability: forbidden, stabilityConfigured: () => true },
    './providers/titan-image': { generateAwsImage: forbidden, generateFalImage: forbidden, awsImageConfigured: () => true, falImageConfigured: () => true },
  })
  const request = { prompt: 'Напиши на фото «8К Алматы» и убери машину', editSource: prepared, plan: 'free', modelId: 'flux-schnell' }
  const result = await router.routeImageGeneration(request)
  assert.equal(result.ok, true)
  assert.equal(result.modelId, 'flux-klein-4b')
  assert.ok(result.enhancedPrompt.includes(request.prompt))
  globalThis.fetch = async () => { throw new Error('Offline provider failure') }
  const failure = await router.routeImageGeneration(request)
  assert.equal(failure.ok, false)
  assert.equal(failure.imageUrl, '')
  delete process.env.CLOUDFLARE_IMAGE_API_TOKEN
  assert.equal((await router.routeImageGeneration(request)).ok, false)

  let generated = 0, charged = 0
  const handler = load('lib/media/generate-photo-route.ts', {
    './asset-store': { mediaAssetExtension: () => 'png' },
    './image-display-preview': { createMalikImageDisplayPreview: async () => null },
    './image-postprocess': { postProcessGeneratedImage: async ({ imageUrl }) => ({ imageUrl }) },
    './image-router': { routeImageGeneration: async (value) => { generated++; assert.ok(value.editSource); assert.equal(value.prompt, request.prompt); return { ok: true, provider: 'cloudflare', modelId: 'flux-klein-4b', imageUrl: 'data:image/png;base64,' + original.toString('base64') } } },
    './limits': { normalizeImageCreditSize: () => '1K', checkImageCreditLimit: async () => ({ ok: true, remaining: 10, daily: 10, cost: 1 }), recordImageCreditUsage: async () => { charged++; return { remaining: 9 } } },
    './providers/agnes-image': { agnesImageConfigured: () => true, generateWithAgnesImage: forbidden },
    './request': { resolveMediaUser: async () => ({ userId: 'test', plan: 'free' }) },
  })
  const post = (body) => handler.handleMalikPhotoGenerationRequest(new Request('https://malik.test/api/ai/image', { method: 'POST', body: JSON.stringify(body) }))
  const missing = await post({ prompt: request.prompt, operation: 'edit' })
  assert.equal(missing.status, 400)
  assert.equal(generated, 0)
  assert.equal(charged, 0)
  const response = await post({ prompt: request.prompt, attachments: input.attachments })
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.operation, 'edit')
  assert.equal(payload.originalPrompt, request.prompt)
  assert.equal(charged, 1)
  console.log('PASS: edit intent, upload validation, original pixels in multipart, aspect ratio, exact lettering, no text-only fallback, API result and usage.')
} finally { globalThis.fetch = savedFetch }
