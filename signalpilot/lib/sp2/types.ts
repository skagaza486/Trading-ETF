export type RejectionLayer = 'ELIGIBILITY' | 'RISK' | 'SIZING'

export interface CandidateSignal {
  rowid: number
  ticker: string
  signal_date: string
  label: string
  close_at_signal: number | null
  next_open: number | null
  earnings_in_window: number | null
  atr_at_signal: number | null
}

export interface OpenLotRow {
  ticker: string
  net_qty: number
  total_cost_cents: number
  avg_cost_cents: number
  earliest_open_date: string
  atr_at_entry: number | null
  sector: string | null
}

export interface EligibilityDecision {
  eligible: boolean
  layer?: RejectionLayer
  code?: string
}

export interface RiskDecision {
  approved: boolean
  code?: string
}

export interface SizingDecision {
  qty: number
  approved: boolean
  code?: string
}

export interface BatchEntryRecord {
  ticker: string
  signalLabel: string
  signalDate: string
  decision: 'APPROVED' | 'REJECTED'
  layer?: RejectionLayer
  code?: string
  intentId?: string
}

export interface ExitRecord {
  ticker: string
  qty: number
  reason: 'TIME_STOP' | 'PRICE_STOP'
  holdingTradingDays: number
  costBasisCents: number
  exitPriceCents: number
  realizedPnlCents: number
  intentId: string
}

export interface DailyBatchResult {
  batchDate: string
  entries: BatchEntryRecord[]
  exits: ExitRecord[]
  navCents: number
  cashCents: number
  openPositions: number
  policyVersion: string
}
