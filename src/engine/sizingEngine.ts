import type { Position } from '../types/capital'
import type { RegimeClass } from '../types/market'
import { cashFloorForRegime } from './riskEngine'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SizingConstraint = 'SINGLE_STOCK_LIMIT' | 'SECTOR_LIMIT' | 'CASH_FLOOR' | 'PRICE_ZERO'

export type SizingResult = {
  qty: number
  sizingCents: number         // qty × priceCents
  bindingConstraint: SizingConstraint
  maxByStockCents: number     // remaining room under 10% single-stock cap
  maxBySectorCents: number    // remaining room under 25% sector cap
  maxByCashCents: number      // deployable cash after cash-floor reserve
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SINGLE_STOCK_LIMIT_PCT = 0.10
const SECTOR_LIMIT_PCT       = 0.25

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Compute the maximum number of shares that can be bought given all risk limits.
 * Pure function — no DB, no network.
 *
 * Uses cost basis (avgCostCents × qty) for existing positions, not current market price.
 * Returns qty=0 if any constraint allows zero or priceCents ≤ 0.
 */
export function computePositionSize(
  capitalBaseCents: number,
  currentPositions: Position[],
  ticker: string,
  sector: string,
  priceCents: number,
  regime: RegimeClass,
): SizingResult {
  const zero = (c: SizingConstraint): SizingResult => ({
    qty: 0, sizingCents: 0, bindingConstraint: c,
    maxByStockCents: 0, maxBySectorCents: 0, maxByCashCents: 0,
  })

  if (priceCents <= 0) return zero('PRICE_ZERO')

  // 1. Single-stock limit: max 10% capital base − existing holding in this ticker
  const existingStockCents = currentPositions
    .filter(p => p.ticker === ticker)
    .reduce((s, p) => s + p.qty * p.avgCostCents, 0)
  const maxByStockCents = Math.max(0, Math.round(capitalBaseCents * SINGLE_STOCK_LIMIT_PCT) - existingStockCents)

  // 2. Sector limit: max 25% capital base − existing sector exposure
  const existingSectorCents = currentPositions
    .filter(p => p.sector === sector)
    .reduce((s, p) => s + p.qty * p.avgCostCents, 0)
  const maxBySectorCents = Math.max(0, Math.round(capitalBaseCents * SECTOR_LIMIT_PCT) - existingSectorCents)

  // 3. Cash floor: deployable cash = total cash − required reserve
  const totalInvestedCents = currentPositions.reduce((s, p) => s + p.qty * p.avgCostCents, 0)
  const cashCents = capitalBaseCents - totalInvestedCents
  const requiredCashCents = Math.round(capitalBaseCents * cashFloorForRegime(regime))
  const maxByCashCents = Math.max(0, cashCents - requiredCashCents)

  const maxCents = Math.min(maxByStockCents, maxBySectorCents, maxByCashCents)
  const qty = Math.floor(maxCents / priceCents)
  const sizingCents = qty * priceCents

  // Identify binding constraint (the one with lowest capacity)
  const candidates: { key: SizingConstraint; val: number }[] = [
    { key: 'SINGLE_STOCK_LIMIT', val: maxByStockCents },
    { key: 'SECTOR_LIMIT',       val: maxBySectorCents },
    { key: 'CASH_FLOOR',         val: maxByCashCents },
  ]
  const binding = candidates.reduce((a, b) => a.val <= b.val ? a : b)

  return {
    qty,
    sizingCents,
    bindingConstraint: binding.key,
    maxByStockCents,
    maxBySectorCents,
    maxByCashCents,
  }
}
