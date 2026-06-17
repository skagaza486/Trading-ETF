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

  const longWatch =
    rsi14 > 50 &&
    macdHistogram > 0 &&
    cmf20 > 0 &&
    obvSlope > 0 &&
    regime !== 'short_friendly'

  const longSetup =
    indicators.close > ema20 &&
    ema20Slope > 0 &&
    rsi14 > 55 &&
    rvol > 1.2 &&
    cmf20 > 0 &&
    regime !== 'short_friendly' &&
    indicators.aboveEma200 !== false

  const longConfirm =
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
  if (longConfirm) {
    const priorLong =
      previousLabel === 'LONG_WATCH' ||
      previousLabel === 'LONG_SETUP' ||
      previousLabel === 'LONG_VCP' ||
      previousLabel === 'LONG_PULLBACK' ||
      previousLabel === 'LONG_CONFIRM' ||
      previousLabel === 'UP_PROMOTION'
    if (priorLong) {
      return previousLabel === 'LONG_SETUP' ? 'UP_PROMOTION' : 'LONG_CONFIRM'
    }
  }

  // VCP: Volatility Contraction Pattern — volume dried up then breakout on volume
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

  if (longSetup) {
    return 'LONG_SETUP'
  }

  // Pullback: trend intact, price pulled back to EMA20 support with bounce close
  const longPullback =
    regime === 'long_friendly' &&
    indicators.ema50Slope !== null && indicators.ema50Slope > 0 &&
    indicators.ema20 !== null && indicators.low <= indicators.ema20 * 1.02 &&
    rsi14 >= 40 && rsi14 <= 50 &&
    clv > 0.8

  if (longPullback) {
    return 'LONG_PULLBACK'
  }

  if (longWatch) {
    return 'LONG_WATCH'
  }

  const shortWatch =
    indicators.close < ema20 &&
    rsi14 < 50 &&
    relStrengthVsSpy < 0 &&
    macdHistogram < 0 &&
    regime !== 'long_friendly'

  const shortSetup =
    indicators.close < ema20 &&
    ema20Slope < 0 &&
    rsi14 < 45 &&
    rvol > 1.5 &&
    cmf20 < 0 &&
    regime !== 'long_friendly'

  const shortConfirm =
    indicators.breakdown20d === true &&
    rvol > 1.5 &&
    cmf20 < -0.05 &&
    clv < 0.35 &&
    ema20 < ema50 &&
    rsi14 < 45 &&
    regime !== 'long_friendly'

  // HYP-009: require prior bar in short ladder to prevent single-day impulse breakdowns
  if (shortConfirm) {
    const priorShort =
      previousLabel === 'SHORT_WATCH' ||
      previousLabel === 'SHORT_SETUP' ||
      previousLabel === 'SHORT_CONFIRM' ||
      previousLabel === 'DOWN_PROMOTION'
    if (priorShort) {
      return previousLabel === 'SHORT_SETUP' ? 'DOWN_PROMOTION' : 'SHORT_CONFIRM'
    }
  }

  if (shortSetup) {
    return 'SHORT_SETUP'
  }

  if (shortWatch) {
    return 'SHORT_WATCH'
  }

  return 'NEUTRAL'
}
