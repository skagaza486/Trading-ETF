import { expect, test } from '@playwright/test'
import { assertNoHorizontalOverflow, openApp, openBottomNavTab } from './helpers/uiQa'

test.describe('primary navigation smoke', () => {
  test('covers all four BottomNav tabs', async ({ page }) => {
    await openApp(page)

    // 大市 (Market) — default landing page
    await expect(page.getByText('今日市場')).toBeVisible()
    await assertNoHorizontalOverflow(page)

    // 板塊 (Sectors)
    await openBottomNavTab(page, '板塊')
    await assertNoHorizontalOverflow(page)

    // 發現 (Discover)
    await openBottomNavTab(page, '發現')
    await assertNoHorizontalOverflow(page)

    // 研究室 (Lab) — only visible in pro mode (set in prepareApp)
    await openBottomNavTab(page, '研究室')
    await assertNoHorizontalOverflow(page)

    // Back to 大市
    await openBottomNavTab(page, '大市')
    await expect(page.getByText('今日市場')).toBeVisible()
  })

  test('BottomNav stays within viewport', async ({ page }) => {
    await openApp(page)
    const nav = page.locator('nav').first()
    await expect(nav).toBeVisible()
    const box = await nav.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      const viewport = page.viewportSize()!
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 2)
      expect(box.x).toBeGreaterThanOrEqual(-1)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 2)
    }
  })
})
