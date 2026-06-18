import { expect, test } from '@playwright/test'
import { assertNoHorizontalOverflow, openApp, openPrimaryTab, openVerifySubTab } from './helpers/uiQa'

test.describe('verify workspace smoke', () => {
  test('covers all three verify sub-tabs', async ({ page }) => {
    await openApp(page)
    await openPrimaryTab(page, 'Verify')

    await openVerifySubTab(page, 'ETF Check')
    await expect(page.getByText('ETF Replay')).toBeVisible()

    await openVerifySubTab(page, 'Stock Check')
    await expect(page.getByText('歷史記錄 All Signals')).toBeVisible()

    await openVerifySubTab(page, 'Signal Proof')
    await expect(page.getByText('Gate Summary 七關卡驗證')).toBeVisible()
    await expect(page.getByText('Research Flags Snapshot 研究旗標快照')).toBeVisible()

    await assertNoHorizontalOverflow(page)
  })
})
