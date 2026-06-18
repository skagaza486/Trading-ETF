import { expect, test } from '@playwright/test'
import { assertElementInViewport, assertElementsDoNotOverlap, assertNoHorizontalOverflow, openApp, openPrimaryTab } from './helpers/uiQa'

test.describe('layout safety smoke', () => {
  test('keeps primary shell elements inside viewport', async ({ page, isMobile }) => {
    await openApp(page)
    await assertElementInViewport(page, '.home-strip')
    await assertElementInViewport(page, isMobile ? '.bottom-nav' : '.side-rail')
    await assertNoHorizontalOverflow(page)
  })

  test('stocks rows render without overlap', async ({ page }) => {
    await openApp(page)
    await openPrimaryTab(page, 'Stocks')
    await expect(page.locator('.stocks-screen')).toBeVisible()
    await expect(page.locator('.stock-terminal-row').first()).toBeVisible()
    await assertElementsDoNotOverlap(page.locator('.stock-terminal-row'))
    await assertNoHorizontalOverflow(page)
  })

  test('etf and verify tables stay wrapped', async ({ page }) => {
    await openApp(page)

    await openPrimaryTab(page, 'ETF')
    await page.getByRole('button', { name: '列表' }).click()
    await expect(page.locator('.table-wrap').first()).toBeVisible()

    await openPrimaryTab(page, 'Verify')
    await page.getByRole('button', { name: 'Signal Proof', exact: true }).click()
    await expect(page.locator('.table-wrap').first()).toBeVisible()

    await assertNoHorizontalOverflow(page)
  })
})
