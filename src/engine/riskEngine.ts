import type { RegimeClass } from '../types/market'
import type {
  Position,
  RiskState,
  EntryProposal,
  GateResult,
  ExitSignal,
  RuleViolation,
  TradeResult,
} from '../types/capital'

// ── Constants ────────────────────────────────────────────────────────────────

const CASH_FLOOR: Record<RegimeClass, number> = {
  long_friendly: 0.05,
  neutral:        0.15,
  short_friendly: 0.30,
}

const MAX_POSITIONS              = 15
const SINGLE_STOCK_LIMIT_PCT     = 0.10  // 10% of capital base
const SECTOR_LIMIT_PCT           = 0.25  // 25% of capital base
const HARD_STOP_PCT              = 0.10  // −10% from avg cost
const TRAILING_STOP_PCT          = 0.20  // −20% from peak price
const EARNINGS_SIZE_REDUCTION    = 0.50  // reduce proposed size 50%
const PAUSE_WEEKS                = 2

// ── Helpers ──────────────────────────────────────────────────────────────────

function positionMarketValueCents(p: Position, currentPriceCents?: number): number {
  const price = currentPriceCents ?? p.avgCostCents
  return p.qty * price
}

function totalMarketValueCents(positions: Position[], prices?: Record<string, number>): number {
  return positions.reduce((sum, p) => sum + positionMarketValueCents(p, prices?.[p.ticker]), 0)
}

function sectorMarketValueCents(positions: Position[], sector: string): number {
  return positions
    .filter(p => p.sector === sector)
    .reduce((sum, p) => sum + positionMarketValueCents(p), 0)
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a new entry proposal passes all risk rules.
 * Pure function — no side effects, no DB calls.
 *
 * If `earningsWithin7d` is true the proposal is not blocked but the
 * recommended size is halved (violation with rule EARNINGS_WINDOW is
 * included as an informational warning, approved=true).
 */
export function checkEntryGate(
  proposal: EntryProposal,
  positions: Position[],
  riskState: RiskState,
  todayIso: string,
): GateResult {
  const violations: RuleViolation[] = []

  // 1. Pause check
  if (riskState.pauseUntil && todayIso < riskState.pauseUntil) {
    violations.push({
      rule: 'PAUSED',
      description: '三連敗暫停',
      detail: `暫停至 ${riskState.pauseUntil}`,
    })
    return { approved: false, violations }
  }

  // 2. Earnings window — informational, not blocking (caller should halve qty)
  if (proposal.earningsWithin7d) {
    violations.push({
      rule: 'EARNINGS_WINDOW',
      description: '業績窗口',
      detail: `7 日內有業績，建議倉位減 ${EARNINGS_SIZE_REDUCTION * 100}%`,
    })
  }

  // 3. Max positions
  if (positions.length >= MAX_POSITIONS) {
    violations.push({
      rule: 'MAX_POSITIONS',
      description: '持倉數量上限',
      detail: `現有 ${positions.length} 個持倉，上限 ${MAX_POSITIONS}`,
    })
  }

  const capitalBase = riskState.capitalBaseCents
  const proposedCost = proposal.proposedCostCents * proposal.proposedQty

  // 4. Single-stock limit — proposed position must be ≤ 10% capital base
  if (capitalBase > 0 && proposedCost / capitalBase > SINGLE_STOCK_LIMIT_PCT) {
    violations.push({
      rule: 'SINGLE_STOCK_LIMIT',
      description: '單股上限 10%',
      detail: `擬投入 ${fmtPct(proposedCost / capitalBase)}，上限 ${fmtPct(SINGLE_STOCK_LIMIT_PCT)}`,
    })
  }

  // 5. Sector limit — existing sector exposure + proposed must be ≤ 25%
  const existingSectorVal = sectorMarketValueCents(positions, proposal.sector)
  const afterSector = existingSectorVal + proposedCost
  if (capitalBase > 0 && afterSector / capitalBase > SECTOR_LIMIT_PCT) {
    violations.push({
      rule: 'SECTOR_LIMIT',
      description: '板塊上限 25%',
      detail: `${proposal.sector} 板塊現為 ${fmtPct(existingSectorVal / capitalBase)}，加入後 ${fmtPct(afterSector / capitalBase)}，上限 ${fmtPct(SECTOR_LIMIT_PCT)}`,
    })
  }

  // 6. Cash floor — after purchase, remaining cash must be ≥ regime floor
  const cashFloor = CASH_FLOOR[riskState.regime]
  const currentMarketValue = totalMarketValueCents(positions)
  const currentCash = capitalBase - currentMarketValue
  const cashAfter = currentCash - proposedCost
  if (capitalBase > 0 && cashAfter / capitalBase < cashFloor) {
    violations.push({
      rule: 'CASH_FLOOR',
      description: `現金底 ${fmtPct(cashFloor)}（${riskState.regime}）`,
      detail: `購入後現金佔比 ${fmtPct(cashAfter / capitalBase)}，低於 ${riskState.regime} 最低 ${fmtPct(cashFloor)}`,
    })
  }

  const hardViolations = violations.filter(v => v.rule !== 'EARNINGS_WINDOW')
  return {
    approved: hardViolations.length === 0,
    violations,
  }
}

/**
 * Check exit rules for an existing position given the current price.
 * Returns shouldExit=true if any hard exit rule fires.
 */
export function checkExitRules(
  position: Position,
  currentPriceCents: number,
): ExitSignal {
  const violations: RuleViolation[] = []

  // Hard stop: current price ≤ avg_cost × (1 − 10%)
  const hardStopLevel = position.avgCostCents * (1 - HARD_STOP_PCT)
  if (currentPriceCents <= hardStopLevel) {
    violations.push({
      rule: 'HARD_STOP',
      description: '硬止損 −10%',
      detail: `現價 ${fmtCents(currentPriceCents)} ≤ 止損位 ${fmtCents(hardStopLevel)}（成本 ${fmtCents(position.avgCostCents)}）`,
    })
  }

  // Trailing stop: current price ≤ peak_price × (1 − 20%)
  const trailingStopLevel = position.peakPriceCents * (1 - TRAILING_STOP_PCT)
  if (currentPriceCents <= trailingStopLevel) {
    violations.push({
      rule: 'TRAILING_STOP',
      description: '移動止損 −20%',
      detail: `現價 ${fmtCents(currentPriceCents)} ≤ 移動止損位 ${fmtCents(trailingStopLevel)}（峰值 ${fmtCents(position.peakPriceCents)}）`,
    })
  }

  return { shouldExit: violations.length > 0, violations }
}

/**
 * Record a trade result and update risk state (three-loss detection).
 * Returns the new RiskState — caller persists it to DB.
 *
 * Three consecutive losses → pauseUntil = today + 14 days.
 */
export function recordTradeResult(
  riskState: RiskState,
  result: TradeResult,
  todayIso: string,
): RiskState {
  const updated = [result, ...riskState.last3Results].slice(0, 3) as TradeResult[]
  const threeLosses = updated.length === 3 && updated.every(r => r === 'loss')

  return {
    ...riskState,
    last3Results: updated,
    pauseUntil: threeLosses ? addDays(todayIso, PAUSE_WEEKS * 7) : riskState.pauseUntil,
  }
}

/**
 * Return true if entry proposals are currently blocked (system is paused).
 */
export function isPaused(riskState: RiskState, todayIso: string): boolean {
  return riskState.pauseUntil !== null && todayIso < riskState.pauseUntil
}

/**
 * Return recommended cash floor (0–1) for the given regime.
 */
export function cashFloorForRegime(regime: RegimeClass): number {
  return CASH_FLOOR[regime]
}

// ── Formatting helpers (kept here — avoid pulling in a format lib) ──────────

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
