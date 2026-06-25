import { describe, it, expect } from 'vitest'
import { computePositionSize } from './sizingEngine'
import type { Position } from '../types/capital'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pos(overrides: Partial<Position> & { ticker: string; sector: string }): Position {
  return {
    id: 1,
    qty: 100,
    avgCostCents: 10000,
    peakPriceCents: 10000,
    sleeve: 'stock',
    openedAt: '2026-01-01',
    ...overrides,
  }
}

// ── Price zero guard ──────────────────────────────────────────────────────────

describe('computePositionSize — edge cases', () => {
  it('returns qty=0 when price is zero', () => {
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', 0, 'neutral')
    expect(r.qty).toBe(0)
    expect(r.bindingConstraint).toBe('PRICE_ZERO')
  })

  it('returns qty=0 when price is negative', () => {
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', -1, 'neutral')
    expect(r.qty).toBe(0)
  })
})

// ── Single-stock limit ────────────────────────────────────────────────────────

describe('computePositionSize — single-stock limit', () => {
  it('caps at 10% of capital base with no existing positions', () => {
    // capital = $100K, limit = $10K, price = $100 → max 100 shares
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', 10000, 'long_friendly')
    expect(r.qty).toBeLessThanOrEqual(100)
    expect(r.maxByStockCents).toBe(10_000_00)  // 10% of $100K
  })

  it('reduces capacity by existing holding in same ticker', () => {
    // already own $5K of AAPL; limit = $10K; remaining = $5K
    const positions = [pos({ ticker: 'AAPL', sector: 'Technology', qty: 50, avgCostCents: 10000 })]
    const r = computePositionSize(100_000_00, positions, 'AAPL', 'Technology', 10000, 'long_friendly')
    expect(r.maxByStockCents).toBe(5_000_00)  // $10K − $5K
  })

  it('binds to SINGLE_STOCK_LIMIT when that is smallest', () => {
    // capital = $100K; single stock limit = $10K; sector room = $25K; cash = huge
    // → stock limit binds
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', 100, 'long_friendly')
    expect(r.bindingConstraint).toBe('SINGLE_STOCK_LIMIT')
  })
})

// ── Sector limit ──────────────────────────────────────────────────────────────

describe('computePositionSize — sector limit', () => {
  it('caps at 25% of capital base for a fresh sector', () => {
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', 10000, 'long_friendly')
    expect(r.maxBySectorCents).toBe(25_000_00)
  })

  it('reduces sector capacity by existing sector positions', () => {
    const positions = [
      pos({ id: 1, ticker: 'MSFT', sector: 'Technology', qty: 100, avgCostCents: 10000 }),  // $10K
    ]
    const r = computePositionSize(100_000_00, positions, 'AAPL', 'Technology', 10000, 'long_friendly')
    expect(r.maxBySectorCents).toBe(15_000_00)  // $25K − $10K
  })

  it('binds to SECTOR_LIMIT when that is smallest', () => {
    // Sector almost full — only $3K room; single stock limit = $10K; cash is fine
    const positions = [
      pos({ id: 1, ticker: 'MSFT', sector: 'Technology', qty: 100, avgCostCents: 22000 }),  // $22K of $25K sector limit
    ]
    const r = computePositionSize(100_000_00, positions, 'AAPL', 'Technology', 10000, 'long_friendly')
    expect(r.bindingConstraint).toBe('SECTOR_LIMIT')
    expect(r.maxBySectorCents).toBe(3_000_00)  // $3K remaining
  })
})

// ── Cash floor ────────────────────────────────────────────────────────────────

describe('computePositionSize — cash floor', () => {
  it('long_friendly: 5% floor leaves 95% deployable (no existing positions)', () => {
    // capital = $100K, invested = $0, floor = 5% = $5K, deployable = $95K
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', 10000, 'long_friendly')
    expect(r.maxByCashCents).toBe(95_000_00)
  })

  it('short_friendly: 30% floor significantly reduces deployable cash', () => {
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', 10000, 'short_friendly')
    expect(r.maxByCashCents).toBe(70_000_00)  // $100K × (1 − 0.30)
  })

  it('neutral: 15% floor', () => {
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', 10000, 'neutral')
    expect(r.maxByCashCents).toBe(85_000_00)
  })

  it('binds to CASH_FLOOR when portfolio nearly fully invested', () => {
    // capital = $100K, invested = $89K (long_friendly, 5% floor → only $6K deployable)
    // single stock limit = $10K; sector = $25K; cash = $6K → cash binds
    const positions = [
      pos({ id: 1, ticker: 'MSFT', sector: 'Financials', qty: 890, avgCostCents: 10000 }),
    ]
    const r = computePositionSize(100_000_00, positions, 'AAPL', 'Technology', 10000, 'long_friendly')
    expect(r.bindingConstraint).toBe('CASH_FLOOR')
    expect(r.maxByCashCents).toBe(6_000_00)  // $100K − $89K − $5K floor
  })

  it('returns qty=0 when no cash remains above floor', () => {
    // capital = $100K, invested = $98K (floor 5% = $5K), cash = $2K → negative deployable
    const positions = [
      pos({ id: 1, ticker: 'MSFT', sector: 'Financials', qty: 980, avgCostCents: 10000 }),
    ]
    const r = computePositionSize(100_000_00, positions, 'AAPL', 'Technology', 10000, 'long_friendly')
    expect(r.qty).toBe(0)
    expect(r.maxByCashCents).toBe(0)
  })
})

// ── Sizing arithmetic ─────────────────────────────────────────────────────────

describe('computePositionSize — arithmetic', () => {
  it('qty × priceCents = sizingCents', () => {
    const r = computePositionSize(100_000_00, [], 'AAPL', 'Technology', 15000, 'long_friendly')
    expect(r.sizingCents).toBe(r.qty * 15000)
  })

  it('floors qty (never fractional shares)', () => {
    // capital = $10K, price = $300, max $1K → 3.33 → floors to 3
    const r = computePositionSize(10_000_00, [], 'AAPL', 'Technology', 30000, 'long_friendly')
    expect(r.qty).toBe(Math.floor(r.maxByStockCents / 30000))
  })
})
