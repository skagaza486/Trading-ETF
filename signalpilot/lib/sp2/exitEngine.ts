import type { OpenLotRow } from './types'
import type { Sp2Policy } from './policy'

export type ExitTrigger = 'TIME_STOP' | 'PRICE_STOP' | null

// Counts Mon–Fri days between from (exclusive) and to (inclusive).
// Does not account for market holidays — acceptable approximation for paper trading.
function tradingDaysBetween(from: string, to: string): number {
  let days = 0
  const end = new Date(to)
  const cursor = new Date(from)
  cursor.setUTCDate(cursor.getUTCDate() + 1)
  while (cursor <= end) {
    const dow = cursor.getUTCDay()
    if (dow !== 0 && dow !== 6) days++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function checkExitTrigger(
  lot: OpenLotRow,
  currentPriceCents: number,
  batchDate: string,
  policy: Sp2Policy,
): { trigger: ExitTrigger; holdingDays: number } {
  const holdingDays = tradingDaysBetween(lot.earliest_open_date, batchDate)

  if (holdingDays >= policy.maxHoldingTradingDays) {
    return { trigger: 'TIME_STOP', holdingDays }
  }

  // Price stop: only when ATR was recorded at entry
  if (lot.atr_at_entry != null) {
    const stopCents = Math.round(
      lot.avg_cost_cents - policy.stopLossAtrMultiplier * lot.atr_at_entry * 100,
    )
    if (currentPriceCents <= stopCents) {
      return { trigger: 'PRICE_STOP', holdingDays }
    }
  }

  return { trigger: null, holdingDays }
}
