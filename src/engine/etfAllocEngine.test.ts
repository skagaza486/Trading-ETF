import { describe, it, expect } from 'vitest'
import {
  computeTargetWeights,
  computeRebalance,
  ETF_UNIVERSE,
  DRIFT_BAND,
  type EtfHolding,
} from './etfAllocEngine'

// ── computeTargetWeights ──────────────────────────────────────────────────────

describe('computeTargetWeights — long_friendly', () => {
  it('SGOV stays at base 10% (floor 5% does not override)', () => {
    const w = computeTargetWeights('long_friendly')
    expect(w.SGOV).toBeCloseTo(0.10, 4)
  })

  it('weights sum to 1.0', () => {
    const w = computeTargetWeights('long_friendly')
    const total = ETF_UNIVERSE.reduce((s, t) => s + w[t], 0)
    expect(total).toBeCloseTo(1.0, 4)
  })

  it('SPY > QQQ > IWM > GLD', () => {
    const w = computeTargetWeights('long_friendly')
    expect(w.SPY).toBeGreaterThan(w.QQQ)
    expect(w.QQQ).toBeGreaterThan(w.IWM)
    expect(w.IWM).toBeGreaterThan(w.GLD)
  })
})

describe('computeTargetWeights — neutral', () => {
  it('SGOV floor overrides base: SGOV = 0.15', () => {
    const w = computeTargetWeights('neutral')
    expect(w.SGOV).toBeCloseTo(0.15, 4)
  })

  it('weights sum to 1.0', () => {
    const w = computeTargetWeights('neutral')
    const total = ETF_UNIVERSE.reduce((s, t) => s + w[t], 0)
    expect(total).toBeCloseTo(1.0, 4)
  })

  it('equity tickers are lower than long_friendly equivalents', () => {
    const on = computeTargetWeights('long_friendly')
    const neutral = computeTargetWeights('neutral')
    expect(neutral.SPY).toBeLessThan(on.SPY)
    expect(neutral.QQQ).toBeLessThan(on.QQQ)
  })
})

describe('computeTargetWeights — short_friendly', () => {
  it('SGOV = 0.30', () => {
    const w = computeTargetWeights('short_friendly')
    expect(w.SGOV).toBeCloseTo(0.30, 4)
  })

  it('weights sum to 1.0', () => {
    const w = computeTargetWeights('short_friendly')
    const total = ETF_UNIVERSE.reduce((s, t) => s + w[t], 0)
    expect(total).toBeCloseTo(1.0, 4)
  })

  it('SGOV significantly higher than base 10% when short_friendly', () => {
    const w = computeTargetWeights('short_friendly')
    expect(w.SGOV).toBeCloseTo(0.30, 4)
    expect(w.SGOV).toBeGreaterThan(0.25) // dominates QQQ and approaches SPY
  })
})

// ── computeRebalance — total value ───────────────────────────────────────────

describe('computeRebalance — totals', () => {
  it('sums holdings correctly', () => {
    const h: EtfHolding[] = [
      { ticker: 'SPY',  valueCents: 40_000_00 },
      { ticker: 'QQQ',  valueCents: 25_000_00 },
      { ticker: 'IWM',  valueCents: 15_000_00 },
      { ticker: 'GLD',  valueCents: 10_000_00 },
      { ticker: 'SGOV', valueCents: 10_000_00 },
    ]
    const r = computeRebalance(h, 'long_friendly')
    expect(r.totalValueCents).toBe(100_000_00)
  })

  it('missing tickers default to 0 current value', () => {
    const h: EtfHolding[] = [{ ticker: 'SPY', valueCents: 10_000_00 }]
    const r = computeRebalance(h, 'long_friendly')
    const qqq = r.allocations.find(a => a.ticker === 'QQQ')!
    expect(qqq.currentPct).toBe(0)
    expect(qqq.tradeCents).toBeGreaterThan(0)  // needs buying
  })
})

// ── computeRebalance — perfectly balanced ────────────────────────────────────

describe('computeRebalance — perfectly balanced long_friendly', () => {
  function perfectHoldings(): EtfHolding[] {
    return [
      { ticker: 'SPY',  valueCents: 40_000_00 },
      { ticker: 'QQQ',  valueCents: 25_000_00 },
      { ticker: 'IWM',  valueCents: 15_000_00 },
      { ticker: 'GLD',  valueCents: 10_000_00 },
      { ticker: 'SGOV', valueCents: 10_000_00 },
    ]
  }

  it('needsRebalance = false', () => {
    const r = computeRebalance(perfectHoldings(), 'long_friendly')
    expect(r.needsRebalance).toBe(false)
  })

  it('no rebalance cards', () => {
    const r = computeRebalance(perfectHoldings(), 'long_friendly')
    expect(r.cards).toHaveLength(0)
  })

  it('all actions = HOLD', () => {
    const r = computeRebalance(perfectHoldings(), 'long_friendly')
    r.allocations.forEach(a => expect(a.action).toBe('HOLD'))
  })

  it('drift < DRIFT_BAND for all', () => {
    const r = computeRebalance(perfectHoldings(), 'long_friendly')
    r.allocations.forEach(a => expect(Math.abs(a.drift)).toBeLessThan(DRIFT_BAND))
  })
})

// ── computeRebalance — regime shift triggers SGOV buy ────────────────────────

describe('computeRebalance — regime shift to short_friendly bumps SGOV', () => {
  it('SGOV current 10% → target 30%: exceeds drift band', () => {
    const h: EtfHolding[] = [
      { ticker: 'SPY',  valueCents: 40_000_00 },
      { ticker: 'QQQ',  valueCents: 25_000_00 },
      { ticker: 'IWM',  valueCents: 15_000_00 },
      { ticker: 'GLD',  valueCents: 10_000_00 },
      { ticker: 'SGOV', valueCents: 10_000_00 },
    ]
    const r = computeRebalance(h, 'short_friendly')
    const sgov = r.allocations.find(a => a.ticker === 'SGOV')!
    expect(sgov.drift).toBeLessThan(-DRIFT_BAND)         // underweight
    expect(sgov.exceedsDriftBand).toBe(true)
    expect(sgov.action).toBe('BUY')
  })

  it('equity tickers become overweight and need selling', () => {
    const h: EtfHolding[] = [
      { ticker: 'SPY',  valueCents: 40_000_00 },
      { ticker: 'QQQ',  valueCents: 25_000_00 },
      { ticker: 'IWM',  valueCents: 15_000_00 },
      { ticker: 'GLD',  valueCents: 10_000_00 },
      { ticker: 'SGOV', valueCents: 10_000_00 },
    ]
    const r = computeRebalance(h, 'short_friendly')
    // SPY target drops from 40% to ~31%, drift ≈ +9% → exceeds band
    const spy = r.allocations.find(a => a.ticker === 'SPY')!
    expect(spy.exceedsDriftBand).toBe(true)
    expect(spy.action).toBe('SELL')
  })

  it('needsRebalance = true after regime shift', () => {
    const h: EtfHolding[] = [
      { ticker: 'SPY',  valueCents: 40_000_00 },
      { ticker: 'QQQ',  valueCents: 25_000_00 },
      { ticker: 'IWM',  valueCents: 15_000_00 },
      { ticker: 'GLD',  valueCents: 10_000_00 },
      { ticker: 'SGOV', valueCents: 10_000_00 },
    ]
    const r = computeRebalance(h, 'short_friendly')
    expect(r.needsRebalance).toBe(true)
  })
})

// ── computeRebalance — drift band edge cases ──────────────────────────────────

describe('computeRebalance — drift band edge cases', () => {
  it('just under drift band = HOLD, no card', () => {
    // SPY target 40%, set current to 44.9% — drift = +4.9% < 5% band
    const total = 100_000_00
    const h: EtfHolding[] = [
      { ticker: 'SPY',  valueCents: Math.round(total * 0.449) },
      { ticker: 'QQQ',  valueCents: Math.round(total * 0.25) },
      { ticker: 'IWM',  valueCents: Math.round(total * 0.15) },
      { ticker: 'GLD',  valueCents: Math.round(total * 0.10) },
      { ticker: 'SGOV', valueCents: total - Math.round(total * 0.449) - Math.round(total * 0.25) - Math.round(total * 0.15) - Math.round(total * 0.10) },
    ]
    const r = computeRebalance(h, 'long_friendly')
    const spy = r.allocations.find(a => a.ticker === 'SPY')!
    expect(spy.exceedsDriftBand).toBe(false)
  })

  it('clearly above drift band (46% vs 40% = +6%) triggers rebalance', () => {
    // SPY target 40%, current 46% → +6% drift well above 5% band
    const h: EtfHolding[] = [
      { ticker: 'SPY',  valueCents: 46_000_00 },
      { ticker: 'QQQ',  valueCents: 25_000_00 },
      { ticker: 'IWM',  valueCents: 15_000_00 },
      { ticker: 'GLD',  valueCents:  4_000_00 },
      { ticker: 'SGOV', valueCents: 10_000_00 },
    ]
    const r = computeRebalance(h, 'long_friendly')
    const spy = r.allocations.find(a => a.ticker === 'SPY')!
    expect(spy.exceedsDriftBand).toBe(true)
  })
})

// ── computeRebalance — trade amounts ─────────────────────────────────────────

describe('computeRebalance — trade amounts', () => {
  it('rebalance card amount is positive', () => {
    const h: EtfHolding[] = [
      { ticker: 'SPY',  valueCents: 50_000_00 }, // 50% vs 40% target → SELL
      { ticker: 'QQQ',  valueCents: 20_000_00 },
      { ticker: 'IWM',  valueCents: 15_000_00 },
      { ticker: 'GLD',  valueCents: 10_000_00 },
      { ticker: 'SGOV', valueCents:  5_000_00 },
    ]
    const r = computeRebalance(h, 'long_friendly')
    r.cards.forEach(c => expect(c.amountCents).toBeGreaterThan(0))
  })

  it('cards sorted by absolute drift (largest first)', () => {
    const h: EtfHolding[] = [
      { ticker: 'SPY',  valueCents: 60_000_00 }, // +20% drift
      { ticker: 'QQQ',  valueCents:  5_000_00 }, // −20% drift
      { ticker: 'IWM',  valueCents: 15_000_00 },
      { ticker: 'GLD',  valueCents: 10_000_00 },
      { ticker: 'SGOV', valueCents: 10_000_00 },
    ]
    const r = computeRebalance(h, 'long_friendly')
    for (let i = 1; i < r.cards.length; i++) {
      const prev = r.allocations.find(a => a.ticker === r.cards[i - 1].ticker)!
      const curr = r.allocations.find(a => a.ticker === r.cards[i].ticker)!
      expect(Math.abs(prev.drift)).toBeGreaterThanOrEqual(Math.abs(curr.drift))
    }
  })
})

// ── computeRebalance — empty portfolio ───────────────────────────────────────

describe('computeRebalance — empty portfolio', () => {
  it('all currentPct = 0 when no holdings', () => {
    const r = computeRebalance([], 'long_friendly')
    r.allocations.forEach(a => expect(a.currentPct).toBe(0))
  })

  it('totalValueCents = 0', () => {
    const r = computeRebalance([], 'long_friendly')
    expect(r.totalValueCents).toBe(0)
  })

  it('no cards when total = 0 (nothing to trade)', () => {
    // drift band check is meaningless with $0 portfolio
    const r = computeRebalance([], 'long_friendly')
    // All tickers would show 100% drift but tradeCents = 0 → no cards
    // (engine rounds target * 0 = 0 trades)
    expect(r.needsRebalance).toBe(false)
  })
})
