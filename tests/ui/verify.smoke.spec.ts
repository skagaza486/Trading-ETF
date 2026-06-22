import { expect, test } from '@playwright/test'
import { assertNoHorizontalOverflow, openApp, openBottomNavTab } from './helpers/uiQa'

test.describe('lab view smoke', () => {
  test('shows signal breadth chart, stats, and walk-forward section', async ({ page }) => {
    await openApp(page)
    await openBottomNavTab(page, '研究室')

    // Signal breadth chart
    await expect(page.getByText('信號趨勢（近 30 日）')).toBeVisible()

    // Ticker history lookup
    await expect(page.getByText('個股信號歷程')).toBeVisible()

    // Signal stats table
    await expect(page.getByText('信號表現統計')).toBeVisible()

    // Walk-forward section (R7)
    await expect(page.getByText('走勢一致性（月度拆解）')).toBeVisible()

    await assertNoHorizontalOverflow(page)
  })

  test('walk-forward section switches label and shows monthly table', async ({ page }) => {
    await openApp(page)
    await openBottomNavTab(page, '研究室')

    await expect(page.getByText('走勢一致性（月度拆解）')).toBeVisible()

    // Monthly data should be visible (mocked)
    await expect(page.getByText('2026-06')).toBeVisible({ timeout: 8_000 })

    // Switch to 突破 label
    await page.getByRole('button', { name: '突破', exact: true }).first().click()
    await assertNoHorizontalOverflow(page)
  })

  test('legacy lab link is accessible', async ({ page }) => {
    await openApp(page)
    await openBottomNavTab(page, '研究室')
    await expect(page.getByText('進階研究室')).toBeVisible()
    const link = page.getByRole('link', { name: '開啟研究室（舊版）↗' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/legacy.html')
  })
})
