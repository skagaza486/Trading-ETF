import { expect, test } from '@playwright/test'
import { assertNoHorizontalOverflow, openApp, openBottomNavTab } from './helpers/uiQa'

test.describe('layout safety smoke', () => {
  test('market page renders hero and no overflow', async ({ page }) => {
    await openApp(page)
    await expect(page.getByText('今日市場')).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })

  test('discover page shows stock cards without overflow', async ({ page }) => {
    await openApp(page)
    await openBottomNavTab(page, '發現')
    await assertNoHorizontalOverflow(page)
  })

  test('sectors page renders without overflow', async ({ page }) => {
    await openApp(page)
    await openBottomNavTab(page, '板塊')
    await assertNoHorizontalOverflow(page)
  })

  test('lab page renders signal stats without overflow', async ({ page }) => {
    await openApp(page)
    await openBottomNavTab(page, '研究室')
    await expect(page.getByText('信號表現統計')).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })
})
