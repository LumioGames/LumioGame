import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '../../../.run/browser-tools/node_modules/playwright/index.mjs'

const output = new URL('../../../.run/presentation-evidence/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = []
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('http://127.0.0.1:5199/tests/visual.html')
    await page.waitForFunction(() => window.presentationFixture && document.querySelector('#stage canvas'))
    await page.waitForTimeout(800)
    const pixels = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
      const source = document.querySelector('#stage canvas')
      const probe = document.createElement('canvas')
      probe.width = 160
      probe.height = 100
      const context = probe.getContext('2d')
      context.drawImage(source, 0, 0, 160, 100)
      const values = context.getImageData(0, 0, 160, 100).data
      const colors = new Set()
      for (let i = 0; i < values.length; i += 4) colors.add(`${values[i]},${values[i + 1]},${values[i + 2]}`)
      resolve(colors.size)
    })))
    assert.ok(pixels > 100, `blank canvas: ${pixels} colors`)
    const first = await page.screenshot({ path: new URL(`desktop-${viewport.width}.png`, output).pathname.replace(/^\/([A-Za-z]:)/, '$1') })
    await page.waitForTimeout(300)
    assert.notDeepEqual(await page.screenshot(), first, 'scene must animate')
    const skill = page.locator('.sk-chip[data-slot="active"]')
    await skill.click()
    await page.getByRole('button', { name: '放炸弹', exact: true }).click()
    assert.deepEqual(await page.evaluate(() => [window.presentationFixture.skills, window.presentationFixture.bombs]), [1, 1])
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.locator('.md-settings.is-on').waitFor()
    assert.equal(await page.getByText('已暂停', { exact: true }).count(), 0)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '切换视角', exact: true }).click()
    const layout = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      letterSpacing: getComputedStyle(document.querySelector('.logo-title')).letterSpacing,
    }))
    assert.equal(layout.scrollWidth, layout.width)
    assert.equal(layout.letterSpacing, 'normal' === layout.letterSpacing ? 'normal' : '0px')
    await page.evaluate(() => { window.presentationFixture.presentation.dispose(); window.presentationFixture.presentation.dispose() })
    assert.equal(await page.locator('#stage canvas, .hud-layer, .player-label').count(), 0)
    assert.deepEqual(errors, [])
    results.push({ viewport, colors: pixels, layout, errors })
    await page.close()
  }
  await writeFile(new URL('verification.json', output), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally { await browser.close() }
