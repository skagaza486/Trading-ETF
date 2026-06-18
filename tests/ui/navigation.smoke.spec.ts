import { expect, test } from '@playwright/test'
import { assertNoHorizontalOverflow, openApp, openPrimaryTab } from './helpers/uiQa'

test.describe('primary navigation smoke', () => {
  test('covers all four main tabs', async ({ page }) => {
    await openApp(page)

    await expect(page.getByText('Action Radar 今日焦點信號')).toBeVisible()

    await openPrimaryTab(page, 'Stocks / 股票')
    await expect(page.getByText('Live Signals 即時信號')).toBeVisible()

    await openPrimaryTab(page, 'ETF')
    await expect(page.getByText('ETF Weekly')).toBeVisible()

    await openPrimaryTab(page, 'Verify / 驗證')
    await expect(page.getByRole('button', { name: 'ETF Check', exact: true })).toBeVisible()
    await expect(page.getByText('ETF Replay')).toBeVisible()

    await openPrimaryTab(page, 'Home / 總覽')
    await expect(page.getByText('Sector Snapshot 板塊快覽')).toBeVisible()

    await assertNoHorizontalOverflow(page)
  })

  test('help dialog opens and closes', async ({ page }) => {
    await openApp(page)

    await page.getByRole('button', { name: 'Help', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '使用說明' })).toBeVisible()
    await page.getByRole('button', { name: '✕' }).click()
    await expect(page.getByRole('dialog', { name: '使用說明' })).toBeHidden()
  })
})
