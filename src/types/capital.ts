import type { RegimeClass } from './market'

export type Sleeve = 'etf' | 'stock'

export type TradeResult = 'win' | 'loss'

/** All monetary values are integer cents to avoid float rounding. */
export type Position = {
  id: number
  ticker: string
  qty: number
  avgCostCents: number   // cost per share in cents
  peakPriceCents: number // highest close since entry, per share
  sleeve: Sleeve
  sector: string
  openedAt: string       // ISO date YYYY-MM-DD
  earningsDate?: string  // nearest upcoming earnings, ISO date
}

export type CashLedgerEntry = {
  id: number
  type: 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal'
  ticker?: string
  amountCents: number    // positive = inflow (sell/dividend/deposit), negative = outflow (buy/withdrawal)
  createdAt: string      // ISO datetime
  memo?: string
}

export type RealizedPnl = {
  id: number
  ticker: string
  pnlCents: number       // positive = profit, negative = loss
  closedAt: string       // ISO date
}

export type RiskState = {
  capitalBaseCents: number  // total capital base (cash + market value)
  currency: 'USD'
  regime: RegimeClass
  pauseUntil: string | null // ISO date; entry proposals blocked until this date
  last3Results: TradeResult[]  // most recent first, max 3
}

/** One paper-trade candidate tracked during the two-week paper wall. */
export type PaperTrade = {
  id: number
  ticker: string
  weekStart: string        // ISO Monday date of the week this belongs to
  entryPriceCents: number
  currentPriceCents: number | null
  sector: string
  regime: string           // regime at entry
  status: 'open' | 'closed'
  closedPriceCents: number | null
  closedAt: string | null
  note: string | null
  createdAt: string
}

/** A proposed entry — caller provides this to checkEntryGate */
export type EntryProposal = {
  ticker: string
  proposedCostCents: number  // cost per share
  proposedQty: number
  sector: string
  sleeve: Sleeve
  earningsWithin7d: boolean
}

export type RuleId =
  | 'PAUSED'
  | 'EARNINGS_WINDOW'
  | 'MAX_POSITIONS'
  | 'SINGLE_STOCK_LIMIT'
  | 'SECTOR_LIMIT'
  | 'CASH_FLOOR'

export type ExitRuleId =
  | 'HARD_STOP'
  | 'TRAILING_STOP'

export type RuleViolation = {
  rule: RuleId | ExitRuleId
  description: string
  detail: string
}

export type GateResult = {
  approved: boolean
  violations: RuleViolation[]
}

export type ExitSignal = {
  shouldExit: boolean
  violations: RuleViolation[]
}
