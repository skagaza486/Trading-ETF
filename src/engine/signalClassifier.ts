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
  // HYP-017 (multi-bar): require prior base buildup — at least 2 of last 5 days had RVOL < 0.8
  const longBreak =
    indicators.breakout20d === true &&
    rvol > 1.6 &&
    cmf20 > 0.1 &&
    clv > 0.65 &&
    ema20 > ema50 &&
    rsi14 > 55 &&
    regime !== 'short_friendly' &&
    indicators.aboveEma200 !== false &&
    indicators.nearHigh52w !== false &&
    (indicators.priorBaseStreak === null || indicators.priorBaseStreak >= 2) &&
    (indicators.ema150 === null || ema50 > indicators.ema150) &&      // HYP-020: EMA50 > EMA150 multi-timeframe alignment
    indicators.extendedFromPivot !== true                              // HYP-021: suppress if already >5% above pivot
    // ADX > 25 (HYP-022) is computed but NOT used as hard gate — n too small to validate; observe via udVolRatio50/adx14 fields

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
  // VCP requires time to form: prior bar must already be in long ladder (hysteresis, same as LONG_BREAK)
  // CLV > 0.6 confirms breakout day had real buying support, not a fade-back close
  const longVcp =
    indicators.aboveEma200 === true &&
    indicators.atrSlope50 !== null && indicators.atrSlope50 < 0 &&
    indicators.rvolRecentAvg10 !== null && indicators.rvolRecentAvg10 < 0.8 &&
    indicators.breakout20d === true &&
    rvol > 1.5 &&
    clv > 0.6 &&
    regime !== 'short_friendly' &&
    (indicators.ema150 === null || ema50 > indicators.ema150)         // HYP-020: same EMA alignment as LONG_BREAK

  if (longVcp) {
    const priorLongVcp =
      previousLabel === 'WATCH' ||
      previousLabel === 'LONG_BASE' ||
      previousLabel === 'LONG_VCP' ||
      previousLabel === 'LONG_BOUNCE' ||
      previousLabel === 'LONG_BREAK'
    if (priorLongVcp) {
      return 'LONG_VCP'
    }
  }

  // LONG_BOUNCE: entry trigger — pullback to EMA20 over recent days, today bounced back above
  // Structure: uptrend intact, above EMA200
  // Multi-bar: price was near EMA20 in last 5 days (recentPullbackNearEma20)
  // HYP-018 (multi-bar): pullback should be on low volume — healthy retracement, not distribution
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
    relStrengthVsSpy > 0 &&
    (indicators.pullbackRvolAvg === null || indicators.pullbackRvolAvg < 1.2)

  if (longBounce) {
    return 'LONG_BOUNCE'
  }

  // LONG_BASE: universe filter — structure intact + compression forming, waiting for a trigger
  // Higher-quality than WATCH: requires EMA200 above, RS positive, sustained compression
  // Not an entry signal — identifies candidates likely to produce LONG_BREAK or LONG_BOUNCE soon
  // HYP-016 (multi-bar): lowRvolDaysInWindow tracks compression persistence (not used as hard gate here)
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

  // WATCH: universe filter — momentum building, structural direction positive
  // HYP-019 (multi-bar): RSI must be trending up over last 3 days — not just today's snapshot
  // This is a watchlist candidate, not an entry signal — not gated
  const watch =
    rsi14 > 50 &&
    macdHistogram > 0 &&
    cmf20 > 0 &&
    obvSlope > 0 &&
    relStrengthVsSpy > -0.02 &&
    (indicators.rsiSlope3 === null || indicators.rsiSlope3 > 0) &&
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
