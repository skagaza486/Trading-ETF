import { expect, test } from '@playwright/test'
import { assertElementInViewport, assertElementsDoNotOverlap, assertNoHorizontalOverflow, openApp, openPrimaryTab } from './helpers/uiQa'

test.describe('layout safety smoke', () => {
  test('keeps summary and bottom nav inside viewport', async ({ page }) => {
    await openApp(page)
    await assertElementInViewport(page, '.summary-strip')
    await assertElementInViewport(page, '.bottom-nav')
    await assertNoHorizontalOverflow(page)
  })

  test('stocks cards render without overlap', async ({ page }) => {
    await openApp(page)
    await openPrimaryTab(page, 'Stocks / 股票')
    await expect(page.locator('.stock-card').first()).toBeVisible()
    await assertElementsDoNotOverlap(page.locator('.stock-card'))
    await assertNoHorizontalOverflow(page)
  })

  test('etf and verify tables stay wrapped', async ({ page }) => {
    await openApp(page)

    await openPrimaryTab(page, 'ETF')
    await page.getByRole('button', { name: '列表' }).click()
    await expect(page.locator('.table-wrap').first()).toBeVisible()

    await openPrimaryTab(page, 'Verify / 驗證')
    await page.getByRole('button', { name: 'Signal Proof', exact: true }).click()
    await expect(page.locator('.table-wrap').first()).toBeVisible()

    await assertNoHorizontalOverflow(page)
  })
})
