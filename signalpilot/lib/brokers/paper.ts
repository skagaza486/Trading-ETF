// PaperBrokerAdapter: deterministic next-bar open fill simulation.
//
// Fill price = next_open (preferred) or close_at_signal (fallback)
//   × (1 + slippage_bps / 10_000).
// price_source is preserved in the fill record for data-quality audit.
import { SLIPPAGE_BPS } from '../sp1/types'

export interface SimulatedFill {
  fill_price_cents: number
  price_source: 'next_open' | 'close_fallback'
}

export async function simulateFill(
  roDb: D1Database,
  ticker: string,
  signalDate: string,
): Promise<SimulatedFill> {
  const row = await roDb
    .prepare('SELECT next_open, close_at_signal FROM signals WHERE ticker = ? AND signal_date = ? LIMIT 1')
    .bind(ticker, signalDate)
    .first<{ next_open: number | null; close_at_signal: number | null }>()

  let rawPrice: number
  let price_source: 'next_open' | 'close_fallback'

  if (row?.next_open != null) {
    rawPrice = row.next_open
    price_source = 'next_open'
  } else if (row?.close_at_signal != null) {
    rawPrice = row.close_at_signal
    price_source = 'close_fallback'
  } else {
    throw new Error(`No price data for ${ticker} on ${signalDate}`)
  }

  const fill_price_cents = Math.round(rawPrice * (1 + SLIPPAGE_BPS / 10_000) * 100)
  return { fill_price_cents, price_source }
}
