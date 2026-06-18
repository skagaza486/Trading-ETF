import type { RegimeClass, StockIndicatorSnapshot, StockSignalLabel } from '../types/signal'

export function resolveStockLabel(
  indicators: StockIndicatorSnapshot,
  regime: RegimeClass,
  previousLabel: StockSignalLabel | null,
  earningsWithinWindow: boolean
): StockSignalLabel {
  const requiredValues = [
    indicators.ema20,
    indicators.ema50,
    indicators.ema20Slope,
    indicators.rsi14,
    indicators.macdHistogram,
    indicators.rvol,
    indicators.cmf20,
    indicators.obvSlope,
    indicators.clv,
    indicators.relStrengthVsSpy,
    indicators.atr
  ]

  if (requiredValues.some(value => value === null)) {
    return 'REVIEW_DATA'
  }

  if (earningsWithinWindow) {
    return 'REVIEW_EVENT'
  }

  const ema20 = indicators.ema20 as number
  const ema50 = indicators.ema50 as number
  const ema20Slope = indicators.ema20Slope as number
  const rsi14 = indicators.rsi14 as number
  const macdHistogram = indicators.macdHistogram as number
  const rvol = indicators.rvol as number
  const cmf20 = indicators.cmf20 as number
  const obvSlope = indicators.obvSlope as number
  const clv = indicators.clv as number
  const relStrengthVsSpy = indicators.relStrengthVsSpy as number

  // AVOID_CHOP: low-energy sideways — no direction, low vol, flat slope
  const choppy =
    rsi14 >= 45 &&
    rsi14 <= 55 &&
    rvol < 0.8 &&
    Math.abs(ema20Slope) < 0.001 &&
    indicators.breakout20d !== true &&
    indicators.breakdown20d !== true

  if (choppy) {
    return 'AVOID_CHOP'
  }

  // ── LONG SIDE ────────────────────────────────────────────────────────────────

  // LONG_BREAK: entry trigger — volume breakout with confirmed prior ladder context
  // Structure: trend aligned, near 52w high
  // Trigger: breakout20d + RVOL expansion + quality close + CMF
  const longBreak =
    indicators.breakout20d === true &&
    rvol > 1.8 &&
    cmf20 > 0.1 &&
    clv > 0.65 &&
    ema20 > ema50 &&
    rsi14 > 55 &&
    regime !== 'short_friendly' &&
    indicators.aboveEma200 !== false &&
    indicators.nearHigh52w !== false

  // HYP-009: require prior bar in long ladder to prevent single-day impulse breakouts
  if (longBreak) {
    const priorLong =
      previousLabel === 'WATCH' ||
      previousLabel === 'LONG_BASE' ||
      previousLabel === 'LONG_VCP' ||
      previousLabel === 'LONG_BOUNCE' ||
      previousLabel === 'LONG_BREAK'
    if (priorLong) {
      return 'LONG_BREAK'
    }
  }

  // LONG_VCP: Volatility Contraction Pattern — structure + contraction + breakout trigger
  // VCP already embeds structure + trigger in a single well-defined pattern
  const longVcp =
    indicators.aboveEma200 === true &&
    indicators.atrSlope50 !== null && indicators.atrSlope50 < 0 &&
    indicators.rvolRecentAvg10 !== null && indicators.rvolRecentAvg10 < 0.8 &&
    indicators.breakout20d === true &&
    rvol > 1.5 &&
    regime !== 'short_friendly'

  if (longVcp) {
    return 'LONG_VCP'
  }

  // LONG_BASE: setup — structure intact + compression forming, waiting for trigger
  // Structure: trend aligned above EMA200, RS positive
  // Compression: ATR contracting OR recent volume drying up
  const longBase =
    indicators.aboveEma200 !== false &&
    ema20 > ema50 &&
    indicators.ema50Slope !== null && indicators.ema50Slope > 0 &&
    ema20Slope > 0 &&
    relStrengthVsSpy > 0 &&
    rsi14 >= 45 && rsi14 <= 65 &&
    (
      (indicators.atrSlope50 !== null && indicators.atrSlope50 < 0) ||
      (indicators.rvolRecentAvg10 !== null && indicators.rvolRecentAvg10 < 0.8)
    ) &&
    regime !== 'short_friendly'

  if (longBase) {
    return 'LONG_BASE'
  }

  // LONG_BOUNCE: entry trigger — pullback to EMA20 over recent days, today bounced back above
  // Structure: uptrend intact, above EMA200
  // Multi-bar: price was near EMA20 in last 5 days (recentPullbackNearEma20)
  // Trigger: close reclaimed EMA20 today with quality close
  const longBounce =
    regime === 'long_friendly' &&
    indicators.ema50Slope !== null && indicators.ema50Slope > 0 &&
    indicators.aboveEma200 !== false &&
    ema20 > ema50 &&
    indicators.recentPullbackNearEma20 === true &&
    indicators.close > ema20 &&
    rsi14 >= 42 && rsi14 <= 58 &&
    clv > 0.6 &&
    relStrengthVsSpy > 0

  if (longBounce) {
    return 'LONG_BOUNCE'
  }

  // WATCH: universe filter — momentum building, structural direction positive
  // This is a watchlist candidate, not an entry signal — not gated
  const watch =
    rsi14 > 50 &&
    macdHistogram > 0 &&
    cmf20 > 0 &&
    obvSlope > 0 &&
    relStrengthVsSpy > -0.02 &&
    regime !== 'short_friendly'

  if (watch) {
    return 'WATCH'
  }

  // ── SHORT SIDE (frozen — 2024-2026 bull market sample biases results) ─────────

  // SHORT_BREAK: entry trigger — breakdown with volume + prior short ladder context
  const shortBreak =
    indicators.breakdown20d === true &&
    rvol > 1.5 &&
    cmf20 < -0.05 &&
    clv < 0.35 &&
    ema20 < ema50 &&
    rsi14 < 45 &&
    regime !== 'long_friendly'

  if (shortBreak) {
    const priorShort =
      previousLabel === 'SHORT_WATCH' ||
      previousLabel === 'SHORT_BASE' ||
      previousLabel === 'SHORT_BREAK'
    if (priorShort) {
      return 'SHORT_BREAK'
    }
  }

  // SHORT_BASE: setup — structure deteriorating, waiting for breakdown trigger
  const shortBase =
    indicators.close < ema20 &&
    ema20Slope < 0 &&
    rsi14 < 45 &&
    rvol > 1.5 &&
    cmf20 < 0 &&
    regime !== 'long_friendly'

  if (shortBase) {
    return 'SHORT_BASE'
  }

  // SHORT_WATCH: early weakness — price below EMA20, momentum turning negative
  const shortWatch =
    indicators.close < ema20 &&
    rsi14 < 50 &&
    relStrengthVsSpy < 0 &&
    macdHistogram < 0 &&
    regime !== 'long_friendly'

  if (shortWatch) {
    return 'SHORT_WATCH'
  }

  return 'NEUTRAL'
}
