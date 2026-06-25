import { describe, it, expect } from 'vitest'
import { runEodExit } from './exitEngine'
import type { Position } from '../types/capital'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pos(overrides: Partial<Position> & { id: number; ticker: string }): Position {
  return {
    qty: 100,
    avgCostCents: 10000,      // $100
    peakPriceCents: 10000,
    sleeve: 'stock',
    sector: 'Technology',
    openedAt: '2026-01-01',
    ...overrides,
  }
}

// ── No exits when all is fine ─────────────────────────────────────────────────

describe('runEodExit — no triggers', () => {
  it('returns empty cards when price is healthy', () => {
    const positions = [pos({ id: 1, ticker: 'AAPL' })]
    const r = runEodExit(positions, { AAPL: 10500 }, 200_000_00)
    expect(r.exitCards).toHaveLength(0)
  })

  it('records peak update when price rises', () => {
    const positions = [pos({ id: 1, ticker: 'AAPL', peakPriceCents: 10000 })]
    const r = runEodExit(positions, { AAPL: 11000 }, 200_000_00)
    expect(r.peakUpdates).toHaveLength(1)
    expect(r.peakUpdates[0].newPeakPriceCents).toBe(11000)
  })

  it('no peak update when price is not a new high', () => {
    const positions = [pos({ id: 1, ticker: 'AAPL', peakPriceCents: 12000 })]
    const r = runEodExit(positions, { AAPL: 11000 }, 200_000_00)
    expect(r.peakUpdates).toHaveLength(0)
  })

  it('skips positions with no price in priceMap', () => {
    const positions = [pos({ id: 1, ticker: 'AAPL' })]
    const r = runEodExit(positions, {}, 200_000_00)
    expect(r.exitCards).toHaveLength(0)
    expect(r.peakUpdates).toHaveLength(0)
  })
})

// ── Hard-stop trigger ─────────────────────────────────────────────────────────

describe('runEodExit — hard stop', () => {
  it('triggers SELL card at exactly −10%', () => {
    // avgCost = $100, hard stop at $90
    const positions = [pos({ id: 1, ticker: 'TSLA', avgCostCents: 10000, peakPriceCents: 10000 })]
    const r = runEodExit(positions, { TSLA: 9000 }, 200_000_00)
    expect(r.exitCards).toHaveLength(1)
    expect(r.exitCards[0].action).toBe('SELL')
    expect(r.exitCards[0].qtyToClose).toBe(100)
    expect(r.exitCards[0].ruleDescription).toContain('硬止損')
  })

  it('pnlCents is negative on hard stop', () => {
    const positions = [pos({ id: 1, ticker: 'TSLA', avgCostCents: 10000, peakPriceCents: 10000, qty: 10 })]
    const r = runEodExit(positions, { TSLA: 9000 }, 200_000_00)
    expect(r.exitCards[0].pnlCents).toBe((9000 - 10000) * 10) // −10,000 cents = −$100
  })

  it('returnPct is negative', () => {
    const positions = [pos({ id: 1, ticker: 'TSLA', avgCostCents: 10000, peakPriceCents: 10000 })]
    const r = runEodExit(positions, { TSLA: 9000 }, 200_000_00)
    expect(r.exitCards[0].returnPct).toBeCloseTo(-0.10, 4)
  })

  it('does not trigger above stop level', () => {
    // avgCost $100, price $91 — above hard stop at $90
    const positions = [pos({ id: 1, ticker: 'TSLA', avgCostCents: 10000, peakPriceCents: 10000 })]
    const r = runEodExit(positions, { TSLA: 9100 }, 200_000_00)
    expect(r.exitCards).toHaveLength(0)
  })
})

// ── Trailing-stop trigger ─────────────────────────────────────────────────────

describe('runEodExit — trailing stop', () => {
  it('triggers SELL when price falls 20% from peak', () => {
    // peak = $150, trailing stop = $120; price = $119
    const positions = [pos({ id: 1, ticker: 'NVDA', avgCostCents: 10000, peakPriceCents: 15000 })]
    const r = runEodExit(positions, { NVDA: 11900 }, 200_000_00)
    expect(r.exitCards).toHaveLength(1)
    expect(r.exitCards[0].ruleDescription).toContain('移動止損')
  })

  it('does not trigger just above trailing stop', () => {
    // peak = $150, trailing stop = $120; price = $121
    const positions = [pos({ id: 1, ticker: 'NVDA', avgCostCents: 10000, peakPriceCents: 15000 })]
    const r = runEodExit(positions, { NVDA: 12100 }, 200_000_00)
    expect(r.exitCards).toHaveLength(0)
  })
})

// ── Sector overweight ─────────────────────────────────────────────────────────

describe('runEodExit — sector overweight', () => {
  it('emits REDUCE card when sector > 25% of capital base', () => {
    // capital = $100K; tech sector = $30K (30%) → overweight
    const positions = [
      pos({ id: 1, ticker: 'AAPL', sector: 'Technology', qty: 100, avgCostCents: 15000, peakPriceCents: 15000 }),
      pos({ id: 2, ticker: 'MSFT', sector: 'Technology', qty: 100, avgCostCents: 15000, peakPriceCents: 15000 }),
    ]
    const priceMap = { AAPL: 15000, MSFT: 15000 }
    const r = runEodExit(positions, priceMap, 100_000_00)
    expect(r.exitCards.some(c => c.action === 'REDUCE')).toBe(true)
  })

  it('REDUCE card has sector rule description', () => {
    const positions = [
      pos({ id: 1, ticker: 'AAPL', sector: 'Technology', qty: 200, avgCostCents: 20000, peakPriceCents: 20000 }),
    ]
    const priceMap = { AAPL: 20000 }
    const r = runEodExit(positions, priceMap, 100_000_00)  // 200×$200 = $40K on $100K = 40%
    const reduce = r.exitCards.find(c => c.action === 'REDUCE')
    expect(reduce).toBeDefined()
    expect(reduce!.ruleDescription).toContain('板塊超限')
  })

  it('does not emit REDUCE when sector is within limit', () => {
    // capital = $100K; tech = $20K (20%) → OK
    const positions = [
      pos({ id: 1, ticker: 'AAPL', sector: 'Technology', qty: 100, avgCostCents: 10000, peakPriceCents: 10000 }),
      pos({ id: 2, ticker: 'MSFT', sector: 'Technology', qty: 100, avgCostCents: 10000, peakPriceCents: 10000 }),
    ]
    const r = runEodExit(positions, { AAPL: 10000, MSFT: 10000 }, 100_000_00)
    expect(r.exitCards.every(c => c.action !== 'REDUCE')).toBe(true)
  })

  it('excludes stop-triggered positions from sector calc', () => {
    // AAPL already triggers hard stop; MSFT alone is only 15% → no sector overweight
    const positions = [
      pos({ id: 1, ticker: 'AAPL', sector: 'Technology', qty: 100, avgCostCents: 10000, peakPriceCents: 10000 }),
      pos({ id: 2, ticker: 'MSFT', sector: 'Technology', qty: 100, avgCostCents: 15000, peakPriceCents: 15000 }),
    ]
    const r = runEodExit(
      positions,
      { AAPL: 8000 /* hard stop */, MSFT: 15000 },
      100_000_00,
    )
    expect(r.exitCards.some(c => c.action === 'SELL' && c.ticker === 'AAPL')).toBe(true)
    expect(r.exitCards.every(c => c.action !== 'REDUCE')).toBe(true)
  })
})

// ── Sector summary ────────────────────────────────────────────────────────────

describe('runEodExit — sector summary', () => {
  it('groups positions by sector correctly', () => {
    const positions = [
      pos({ id: 1, ticker: 'AAPL', sector: 'Technology' }),
      pos({ id: 2, ticker: 'JNJ',  sector: 'Healthcare' }),
    ]
    const r = runEodExit(positions, { AAPL: 10000, JNJ: 10000 }, 200_000_00)
    expect(r.sectors).toHaveLength(2)
    const tech = r.sectors.find(s => s.sector === 'Technology')
    expect(tech).toBeDefined()
    expect(tech!.overweight).toBe(false)
  })
})
