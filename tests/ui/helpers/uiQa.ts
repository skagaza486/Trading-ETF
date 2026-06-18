import { expect, type Locator, type Page } from '@playwright/test'
import { buildFinnhubPayload, buildYahooChartPayload } from './mockMarketData'

export async function installMockRoutes(page: Page) {
  await page.route('**/api/yahoo/**', async route => {
    const url = new URL(route.request().url())
    const tickerMatch = url.pathname.match(/\/v8\/finance\/chart\/(.+)$/)
    const ticker = decodeURIComponent(tickerMatch?.[1] ?? 'SPY')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildYahooChartPayload(ticker))
    })
  })

  await page.route('**/api/finnhub/**', async route => {
    const url = new URL(route.request().url())
    const symbol = url.searchParams.get('symbol') ?? 'SPY'

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildFinnhubPayload(symbol))
    })
  })
}

export async function prepareApp(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('onboarding_v1_done', '1')
  })
  await installMockRoutes(page)
}

export async function openApp(page: Page) {
  await prepareApp(page)
  await page.goto('/')
  await closeOnboardingIfPresent(page)
  await expect(page.locator('.content-shell')).toBeVisible()
  await expect(page.locator('.side-rail, .bottom-nav').first()).toBeAttached()
}

export async function closeOnboardingIfPresent(page: Page) {
  const skip = page.getByRole('button', { name: '略過' })
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
  }
}

function primaryTabPattern(label: string): RegExp {
  switch (label) {
    case 'Home':
    case 'Home / 總覽':
      return /Home\s*總覽|Home/i
    case 'Stocks':
    case 'Stocks / 股票':
      return /Stocks\s*股票|Stocks/i
    case 'ETF':
      return /^ETF$/i
    case 'Verify':
    case 'Verify / 驗證':
      return /Verify\s*驗證|Verify/i
    default:
      return new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
}

export async function openPrimaryTab(page: Page, label: string) {
  const pattern = primaryTabPattern(label)
  const nav = page.locator('.side-rail__nav:visible, .bottom-nav:visible').first()
  await expect(nav).toBeVisible()
  await nav.locator('button').filter({ hasText: pattern }).first().click()
}

export async function openVerifySubTab(page: Page, label: string) {
  await page.locator('.segmented-control--sub button').filter({ hasText: new RegExp(label, 'i') }).first().click()
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth - root.clientWidth
  })

  expect(overflow).toBeLessThanOrEqual(2)
}

export async function assertElementsDoNotOverlap(locator: Locator) {
  const boxes = await locator.evaluateAll(nodes =>
    nodes
      .map(node => {
        const rect = (node as HTMLElement).getBoundingClientRect()
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
      })
      .filter(rect => rect.width > 0 && rect.height > 0)
  )

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      const separated = a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y
      expect(separated).toBeTruthy()
    }
  }
}

export async function assertElementInViewport(page: Page, selector: string) {
  const locator = page.locator(selector).first()
  await expect(locator).toBeVisible()
  const isInViewport = await locator.evaluate(node => {
    const rect = (node as HTMLElement).getBoundingClientRect()
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
  })
  expect(isInViewport).toBeTruthy()
}
