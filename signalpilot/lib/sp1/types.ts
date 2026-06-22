// SP-1 Paper Ledger — shared types and constants.
//
// Integer minor units:
//   Monetary: cents (USD × 100).  $1.00 = 100.
//   Quantities: whole shares (INTEGER). No fractional in SP-1.

export const PAPER_ACCOUNT_ID = 'paper-001'

/** $1,000 per position: conservative enough for ~100 simultaneous positions on a $100k account. */
export const TARGET_NOTIONAL_CENTS = 100_000

/** 10 bps applied to BUY price — simulates market-order slippage. */
export const SLIPPAGE_BPS = 10

/** SP plan §10 allowlist: only these labels may generate trade intents. */
export const ELIGIBLE_LABELS = new Set(['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE'])

export interface SignalRow {
  rowid: number
  ticker: string
  signal_date: string
  label: string
  close_at_signal: number | null
  next_open: number | null
  earnings_in_window: number | null  // D1 stores booleans as 0/1
}

export interface IntentRecord {
  id: string
  account_id: string
  ticker: string
  direction: string
  signal_date: string
  signal_label: string
  source_signal_id: number | null
  target_notional_cents: number
  eligibility_status: string
  rejection_reason: string | null
  created_at: string
  created_by: string
}

export interface OrderRecord {
  id: string
  intent_id: string
  account_id: string
  ticker: string
  side: string
  order_type: string
  qty: number
  status: string
  submitted_at: string
  adapter: string
  adapter_order_id: string | null
}

export interface FillRecord {
  id: string
  order_id: string
  account_id: string
  ticker: string
  side: string
  fill_date: string
  fill_price_cents: number
  qty: number
  gross_cents: number
  commission_cents: number
  net_cents: number
  price_source: string
  created_at: string
}

export interface CashEntry {
  id: string
  account_id: string
  ts: string
  entry_type: string
  amount_cents: number
  running_balance_cents: number
  reference_id: string | null
  description: string | null
}

export interface PositionLot {
  id: string
  account_id: string
  ticker: string
  fill_id: string
  open_date: string
  qty: number
  cost_basis_cents: number
  closed_qty: number
  close_date: string | null
  realized_pnl_cents: number | null
  status: string
}

export interface AggregatedPosition {
  ticker: string
  net_qty: number
  total_cost_cents: number
  avg_cost_cents: number
}

export interface EligibilityResult {
  eligible: boolean
  reason?: string
}

export interface IntentFlowResult {
  intent: IntentRecord
  order: OrderRecord | null
  fill: FillRecord | null
  cash_balance_cents: number
}
