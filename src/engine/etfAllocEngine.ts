import type { RegimeClass } from '../types/market'

// ── Universe ──────────────────────────────────────────────────────────────────

export type EtfTicker = 'SPY' | 'QQQ' | 'IWM' | 'GLD' | 'SGOV'

export const ETF_UNIVERSE: EtfTicker[] = ['SPY', 'QQQ', 'IWM', 'GLD', 'SGOV']

export const ETF_META: Record<EtfTicker, { name: string; role: string }> = {
  SPY:  { name: 'S&P 500',        role: '美股核心' },
  QQQ:  { name: 'Nasdaq-100',     role: '科技成長' },
  IWM:  { name: 'Russell 2000',   role: '小型股' },
  GLD:  { name: 'Gold ETF',       role: '避險' },
  SGOV: { name: 'T-Bill (<3M)',   role: '現金代理' },
}

// ── Target weights ────────────────────────────────────────────────────────────

/** Base weights when regime is long_friendly (5% cash floor). */
const BASE_WEIGHTS: Record<EtfTicker, number> = {
  SPY:  0.40,
  QQQ:  0.25,
  IWM:  0.15,
  GLD:  0.10,
  SGOV: 0.10,
}

/**
 * Minimum SGOV allocation per regime.
 * SGOV acts as the cash proxy — its floor rises with the regime cash floor.
 */
const SGOV_FLOOR: Record<RegimeClass, number> = {
  long_friendly: 0.05,   // base 10% already exceeds this
  neutral:        0.15,
  short_friendly: 0.30,
}

const EQUITY_TICKERS: EtfTicker[] = ['SPY', 'QQQ', 'IWM', 'GLD']

/**
 * Compute regime-adjusted target weights.
 * SGOV = max(base 10%, regime floor). Equity tickers scale proportionally to fill the rest.
 */
export function computeTargetWeights(regime: RegimeClass): Record<EtfTicker, number> {
  const sgov = Math.max(BASE_WEIGHTS.SGOV, SGOV_FLOOR[regime])
  const equityPool = 1 - sgov
  const baseEquityTotal = EQUITY_TICKERS.reduce((s, t) => s + BASE_WEIGHTS[t], 0)

  const weights = { ...BASE_WEIGHTS, SGOV: sgov }
  for (const t of EQUITY_TICKERS) {
    weights[t] = round4((BASE_WEIGHTS[t] / baseEquityTotal) * equityPool)
  }
  // Normalise rounding drift
  const total = ETF_UNIVERSE.reduce((s, t) => s + weights[t], 0)
  const drift = 1 - total
  weights.SPY = round4(weights.SPY + drift)

  return weights
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type EtfHolding = {
  ticker: EtfTicker
  valueCents: number  // current market value, integer cents
}

export type EtfAllocation = {
  ticker: EtfTicker
  targetPct: number       // 0–1
  currentPct: number      // 0–1
  drift: number           // currentPct − targetPct (signed; positive = overweight)
  exceedsDriftBand: boolean
  action: 'BUY' | 'SELL' | 'HOLD'
  tradeCents: number      // positive = buy, negative = sell, 0 = hold
}

export type RebalanceCard = {
  ticker: EtfTicker
  action: 'BUY' | 'SELL'
  amountCents: number     // always positive
  fromPct: number
  toPct: number
  reason: string
}

export type RebalanceResult = {
  totalValueCents: number
  regime: RegimeClass
  sgovFloor: number
  driftBand: number
  allocations: EtfAllocation[]
  needsRebalance: boolean
  cards: RebalanceCard[]
}

// ── Drift band ────────────────────────────────────────────────────────────────

/** Trigger rebalance when |actual − target| ≥ this (absolute percentage points). */
export const DRIFT_BAND = 0.05

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Compute full rebalance analysis given current holdings and regime.
 * Pure function — no DB, no network.
 *
 * Holdings should include one entry per ETF; missing tickers are treated as 0.
 */
export function computeRebalance(
  holdings: EtfHolding[],
  regime: RegimeClass,
): RebalanceResult {
  const totalValueCents = holdings.reduce((s, h) => s + h.valueCents, 0)
  const targets = computeTargetWeights(regime)

  const holdingMap: Record<string, number> = {}
  for (const h of holdings) holdingMap[h.ticker] = h.valueCents

  const allocations: EtfAllocation[] = ETF_UNIVERSE.map(ticker => {
    const currentCents = holdingMap[ticker] ?? 0
    const currentPct = totalValueCents > 0 ? currentCents / totalValueCents : 0
    const targetPct = targets[ticker]
    const drift = currentPct - targetPct
    const exceedsDriftBand = Math.abs(drift) >= DRIFT_BAND
    const targetCents = Math.round(totalValueCents * targetPct)
    const tradeCents = targetCents - currentCents
    const action: 'BUY' | 'SELL' | 'HOLD' =
      Math.abs(tradeCents) < 100 ? 'HOLD' : tradeCents > 0 ? 'BUY' : 'SELL'

    return { ticker, targetPct, currentPct, drift, exceedsDriftBand, action, tradeCents }
  })

  const cards: RebalanceCard[] = allocations
    .filter(a => a.exceedsDriftBand && a.action !== 'HOLD')
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
    .map(a => ({
      ticker: a.ticker,
      action: a.action as 'BUY' | 'SELL',
      amountCents: Math.abs(a.tradeCents),
      fromPct: a.currentPct,
      toPct: a.targetPct,
      reason: a.drift < 0
        ? `偏低 ${fmtPct(Math.abs(a.drift))}（目標 ${fmtPct(a.targetPct)}，現為 ${fmtPct(a.currentPct)}）`
        : `偏高 ${fmtPct(Math.abs(a.drift))}（目標 ${fmtPct(a.targetPct)}，現為 ${fmtPct(a.currentPct)}）`,
    }))

  return {
    totalValueCents,
    regime,
    sgovFloor: SGOV_FLOOR[regime],
    driftBand: DRIFT_BAND,
    allocations,
    needsRebalance: cards.length > 0,
    cards,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}
