import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const base = process.env.MALIK_QA_BASE_URL
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) {
  throw Error('Set MALIK_QA_BASE_URL to a local test server only')
}
const { chromium } = require(process.env.MALIK_QA_PLAYWRIGHT_PATH || 'playwright')
const fixtureAnswer = 'Malik Oil AI: требуется история добычи, единицы и даты. Проверка инженера обязательна.'
const browser = await chromium.launch({
  executablePath: process.env.MALIK_QA_CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 }, isMobile: width === 390, hasTouch: width === 390,
    })
    try {
      await ctx.addCookies([{ name: 'malik-guest', value: '1', url: base }])
      const sent = []
      await ctx.route(/\/api\/stream(?:\/|\?|$)/, async route => {
        if (route.request().method() !== 'POST') return route.continue()
        sent.push(JSON.parse(route.request().postData()))
        const body = 'event: content\ndata: ' + JSON.stringify({ type: 'content', content: fixtureAnswer })
          + '\n\nevent: done\ndata: ' + JSON.stringify({ type: 'done', provider: 'fixture', model: 'fixture', sources: [], usedWeb: false }) + '\n\n'
        await route.fulfill({ status: 200, headers: {
          'content-type': 'text/event-stream',
          'x-malik-background-turn-id': '6f1f8a8e-3c2b-4b7a-9f0e-0a1b2c3d4e5f',
        }, body })
      })
      const page = await ctx.newPage()
      await page.goto(base + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 })
      const field = page.locator('.thome-composer textarea:visible').first()
      await field.waitFor({ timeout: 30000 })
      await field.fill('@oil')
      const choice = page.getByRole('option', { name: 'Malik Oil AI' })
      await choice.waitFor()
      const menu = page.getByRole('listbox', { name: 'Скиллы' })
      assert.equal(await menu.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)', 'Mention popup is pure black')
      assert.equal(await menu.evaluate(el => getComputedStyle(el).boxShadow), 'none', 'Mention popup has no gray card shadow')
      assert.equal(await choice.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)', 'Mention option is pure black')
      assert.ok(await choice.locator('svg').count() > 0)
      await choice.click()
      assert.equal(sent.length, 0, 'Selection does not execute the engine')
      assert.equal(await page.locator('[data-petroleum-topic-title]').count(), 0, 'Topic appears only after send')
      await field.fill('@Malik Oil AI Проанализируй нефтяную скважину')
      await field.press('Enter')
      const chatfield = page.locator('.malik-composer-textarea:visible').first()
      await chatfield.waitFor({ timeout: 30000 })
      await page.getByText(fixtureAnswer, { exact: true }).waitFor({ timeout: 15000 })
      const topic = page.locator('[data-petroleum-topic-title]')
      await topic.waitFor()
      assert.equal(await topic.textContent().then(text => text.trim()), 'Обсуждение нефти')
      assert.equal(await topic.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'Topic has no background')
      assert.equal(await topic.evaluate(el => getComputedStyle(el).textAlign), 'center')
      assert.equal(sent.length, 1)
      assert.equal(sent[0].selectedSkillId, 'petroleum.analyze')
      assert.equal(await page.locator('[data-malik-message="user"]').count(), 1)
      assert.equal(await page.locator('[data-malik-message="assistant"]').count(), 1)
      assert.equal(await page.locator('[data-malik-message="assistant"] img').count(), 0)
      await chatfield.fill('@')
      await page.getByRole('option', { name: 'Malik Oil AI' }).waitFor()
      await chatfield.press('Enter')
      assert.equal(await chatfield.inputValue(), '@Malik Oil AI ')
      await page.getByLabel('Отключить Malik Oil AI').click()
      assert.equal(await chatfield.inputValue(), '')
      assert.equal(sent.length, 1, 'Removing a skill does not send another turn')
      await chatfield.fill('Уточни вывод')
      await chatfield.press('Enter')
      await page.waitForFunction(() => document.querySelectorAll('[data-malik-message="user"]').length === 2)
      assert.equal(sent.length, 2, 'Follow-up sent once')
      assert.equal(await topic.count(), 1, 'Petroleum topic remains after a follow-up without @')
      console.log(`PASS full production-built guest Home -> Chat at ${width}px: SVG, selection/removal, structured ID, single user/assistant turn, no answer image; stream network is a fixture`)
    } finally {
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}
