import type { TickerHistory } from '../types/indicator'
import type { RegimeClass, ResearchFlag, StockSignal } from '../types/signal'
import { classifyRegime } from './marketRegime'
import { computeATR, computeCLV, computeCMF, computeEMA, computeEMASlope, computeMACD, computeOBV, computeRSI, computeRVOL } from './indicatorEngine'
import { daysUntilDate, latestBar, percentChange, regressionSlope } from './historyUtils'
import { resolveStockLabel } from './signalClassifier'
import type { RegimeInputs } from '../types/market'
import type { StockIndicatorSnapshot } from '../types/signal'

function latestValue<T>(values: (T | null)[]): T | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index]
  }
  return null
}

function latestEmaCheck(history: TickerHistory | undefined, period: number): boolean | null {
  if (!history || history.bars.length < period) return null
  const ema = computeEMA(history.bars, period).at(-1) ?? null
  const close = latestBar(history)?.close ?? null

  if (ema === null || close === null) return null
  return close >= ema
}

function deriveRegime(benchmarks: Record<string, TickerHistory>): RegimeClass {
  const inputs: RegimeInputs = {
    spyAboveEma50: latestEmaCheck(benchmarks.SPY ?? benchmarks.VOO, 50),
    qqqAboveEma50: latestEmaCheck(benchmarks.QQQ, 50),
    vixLevel: latestBar(benchmarks['^VIX'])?.close ?? null,
    hkMarketAboveEma40w: latestEmaCheck(benchmarks['2800.HK'], 200),
    goldAboveEma40w: latestEmaCheck(benchmarks.GLD, 200),
    rspAboveEma50: latestEmaCheck(benchmarks.RSP, 50)
  }

  return classifyRegime(inputs)
}

function computeRelativeStrengthVsSpy(history: TickerHistory, spyHistory: TickerHistory | undefined, lookback: number): number | null {
  if (!spyHistory) return null

  const stockBars = history.bars
  const spyBars = spyHistory.bars

  if (stockBars.length <= lookback || spyBars.length <= lookback) return null

  const stockReturn = percentChange(stockBars.at(-1)?.close ?? NaN, stockBars.at(-1 - lookback)?.close ?? NaN)
  const spyReturn = percentChange(spyBars.at(-1)?.close ?? NaN, spyBars.at(-1 - lookback)?.close ?? NaN)

  if (stockReturn === null || spyReturn === null) return null

  return stockReturn - spyReturn
}

function computeBreakout20d(history: TickerHistory, atr: number | null): boolean | null {
  if (history.bars.length < 21) return null
  const current = history.bars.at(-1)
  const priorHigh = Math.max(...history.bars.slice(-21, -1).map(bar => bar.high))
  if (!current) return null
  const margin = atr !== null ? atr * 0.5 : priorHigh * 0.003
  return current.close > priorHigh + margin
}

function computeBreakdown20d(history: TickerHistory, atr: number | null): boolean | null {
  if (history.bars.length < 21) return null
  const current = history.bars.at(-1)
  const priorLow = Math.min(...history.bars.slice(-21, -1).map(bar => bar.low))
  if (!current) return null
  const margin = atr !== null ? atr * 0.5 : 0
  return current.close < priorLow - margin
}

function obvSlopeValue(history: TickerHistory): number | null {
  const obv = computeOBV(history.bars)
  const sample = obv.slice(-10)
  if (sample.length < 10) return null
  return regressionSlope(sample)
}

function earningsDaysAway(signalDate: string, earningsDate: string | null): number | null {
  if (!earningsDate) return null
  const delta = daysUntilDate(signalDate, earningsDate)
  if (delta === null || delta < 0) return null
  return delta
}

function buildIndicatorSnapshot(
  history: TickerHistory,
  benchmarks: Record<string, TickerHistory>
): StockIndicatorSnapshot {
  const ema20 = computeEMA(history.bars, 20)
  const ema50 = computeEMA(history.bars, 50)
  const ema200 = computeEMA(history.bars, 200)
  const ema20Slope = computeEMASlope(ema20, 5)
  const ema50Slope = computeEMASlope(ema50, 5)
  const rsi14 = computeRSI(history.bars, 14)
  const macd = computeMACD(history.bars)
  const rvol = computeRVOL(history.bars, 20)
  const cmf20 = computeCMF(history.bars, 20)
  const clv = computeCLV(history.bars)
  const atr = computeATR(history.bars, 14)

  // ATR contraction slope over last 50 bars (negative = contracting volatility)
  const atrDefined = atr.filter((v): v is number => v !== null)
  const atrSlope50 = atrDefined.length >= 10 ? regressionSlope(atrDefined.slice(-50)) : null

  // Prior 10-bar average RVOL (excludes current bar) for VCP contraction check
  const rvolPrior10 = rvol.slice(-11, -1).filter((v): v is number => v !== null)
  const rvolRecentAvg10 = rvolPrior10.length >= 5
    ? rvolPrior10.reduce((s, v) => s + v, 0) / rvolPrior10.length
    : null

  const latestClose = latestBar(history)?.close ?? 0
  const latestLow = latestBar(history)?.low ?? 0
  const latestEma200 = latestValue(ema200)
  const bars = history.bars
  const high52w = bars.length > 0
    ? Math.max(...bars.slice(-Math.min(252, bars.length)).map(b => b.high))
    : null

  return {
    close: latestClose,
    low: latestLow,
    ema20: latestValue(ema20),
    ema50: latestValue(ema50),
    ema200: latestEma200,
    ema20Slope: latestValue(ema20Slope),
    ema50Slope: latestValue(ema50Slope),
    rsi14: latestValue(rsi14),
    macdHistogram: macd.at(-1)?.histogram ?? null,
    rvol: latestValue(rvol),
    cmf20: latestValue(cmf20),
    obvSlope: obvSlopeValue(history),
    clv: clv.at(-1) ?? null,
    atrSlope50,
    rvolRecentAvg10,
    breakout20d: computeBreakout20d(history, latestValue(atr)),
    breakdown20d: computeBreakdown20d(history, latestValue(atr)),
    relStrengthVsSpy: computeRelativeStrengthVsSpy(history, benchmarks.SPY, 20),
    atr: latestValue(atr),
    aboveEma200: latestEma200 !== null ? latestClose >= latestEma200 : null,
    nearHigh52w: high52w !== null ? latestClose >= high52w * 0.75 : null
  }
}

export function classifyStock(
  history: TickerHistory,
  benchmarks: Record<string, TickerHistory>,
  earningsDate: string | null,
  regime: RegimeClass
): StockSignal {
  const signalDate = latestBar(history)?.date ?? ''

  if (history.bars.length < 60 || !signalDate) {
    return {
      ticker: history.ticker,
      signalDate,
      label: 'REVIEW_DATA',
      researchFlags: [],
      indicators: {
        close: latestBar(history)?.close ?? 0,
        low: latestBar(history)?.low ?? 0,
        ema20: null,
        ema50: null,
        ema200: null,
        ema20Slope: null,
        ema50Slope: null,
        rsi14: null,
        macdHistogram: null,
        rvol: null,
        cmf20: null,
        obvSlope: null,
        clv: null,
        atrSlope50: null,
        rvolRecentAvg10: null,
        breakout20d: null,
        breakdown20d: null,
        relStrengthVsSpy: null,
        atr: null,
        aboveEma200: null,
        nearHigh52w: null
      },
      regime,
      earningsWithinWindow: false,
      reason: 'Insufficient lookback history.'
    }
  }

  const effectiveRegime = regime ?? deriveRegime(benchmarks)
  const indicators = buildIndicatorSnapshot(history, benchmarks)
  const earningsDays = earningsDaysAway(signalDate, earningsDate)
  const earningsWithinReviewWindow = earningsDays !== null && earningsDays <= 3
  const earningsWithinDangerWindow = earningsDays !== null && earningsDays <= 5

  let previousLabel: StockSignal['previousLabel'] | null = null

  if (history.bars.length >= 61) {
    const previousHistory: TickerHistory = {
      ...history,
      bars: history.bars.slice(0, -1)
    }
    // Slice benchmarks to previous day so regime reflects yesterday's market.
    const previousBenchmarks: Record<string, TickerHistory> = Object.fromEntries(
      Object.entries(benchmarks).map(([ticker, benchmarkHistory]) => [ticker, { ...benchmarkHistory, bars: benchmarkHistory.bars.slice(0, -1) }])
    )
    const previousRegime = deriveRegime(previousBenchmarks)
    const previousIndicators = buildIndicatorSnapshot(previousHistory, previousBenchmarks)
    const previousSignalDate = latestBar(previousHistory)?.date ?? signalDate
    const previousEarningsDays = earningsDaysAway(previousSignalDate, earningsDate)
    previousLabel = resolveStockLabel(
      previousIndicators,
      previousRegime,
      null,
      previousEarningsDays !== null && previousEarningsDays <= 3
    )
  }

  let label = resolveStockLabel(indicators, effectiveRegime, previousLabel, earningsWithinReviewWindow)

  if (earningsWithinDangerWindow && (label === 'LONG_CONFIRM' || label === 'UP_PROMOTION')) {
    label = 'LONG_SETUP'
  }

  if (earningsWithinDangerWindow && (label === 'SHORT_CONFIRM' || label === 'DOWN_PROMOTION')) {
    label = 'SHORT_SETUP'
  }

  const researchFlags: ResearchFlag[] = []

  // I4: LONG_BASE_BREAK research prototype — low-RVOL base then volume expansion breakout
  if (label !== 'REVIEW_DATA' && label !== 'REVIEW_EVENT' && effectiveRegime !== 'short_friendly') {
    const rvolSeries = computeRVOL(history.bars, 20)
    const prior60Rvol = rvolSeries.slice(-61, -1).filter((v): v is number => v !== null)
    const lowRvolDays = prior60Rvol.filter(v => v < 0.7).length
    const high60d = history.bars.length >= 61
      ? Math.max(...history.bars.slice(-61, -1).map(b => b.high))
      : null
    if (
      lowRvolDays >= 40 &&
      (indicators.rvol ?? 0) > 1.8 &&
      high60d !== null &&
      indicators.close > high60d
    ) {
      researchFlags.push('BASE_BREAK')
    }
  }

  // R8: Wyckoff-style distribution warning — heavy volume, weak finish, near 52W high.
  if (label !== 'REVIEW_DATA' && label !== 'REVIEW_EVENT') {
    const latest = latestBar(history)
    const high52w = history.bars.length > 0
      ? Math.max(...history.bars.slice(-Math.min(252, history.bars.length)).map(bar => bar.high))
      : null
    const dayRange = latest ? latest.high - latest.low : 0
    const body = latest ? Math.abs(latest.close - latest.open) : 0
    const upperShadow = latest ? latest.high - Math.max(latest.open, latest.close) : 0
    const longUpperShadow = dayRange > 0 && upperShadow / dayRange >= 0.35 && upperShadow > body
    const weakFinish = latest ? (longUpperShadow || latest.close < latest.open) : false
    const near52wHigh = high52w !== null && indicators.close >= high52w * 0.95

    if ((indicators.rvol ?? 0) > 2.5 && weakFinish && near52wHigh) {
      researchFlags.push('DISTRIBUTION_WARNING')
    }
  }

  const reasonParts = [
    `Regime ${effectiveRegime}`,
    `RSI ${indicators.rsi14 === null ? 'n/a' : indicators.rsi14.toFixed(1)}`,
    `RVOL ${indicators.rvol === null ? 'n/a' : indicators.rvol.toFixed(2)}`,
    `CMF ${indicators.cmf20 === null ? 'n/a' : indicators.cmf20.toFixed(2)}`,
    `RS vs SPY ${indicators.relStrengthVsSpy === null ? 'n/a' : `${(indicators.relStrengthVsSpy * 100).toFixed(1)}%`}`
  ]

  if (indicators.aboveEma200 !== null) {
    reasonParts.push(`EMA200 ${indicators.aboveEma200 ? '✓' : '✗'}`)
  }

  if (indicators.nearHigh52w !== null) {
    reasonParts.push(`H52 ${indicators.nearHigh52w ? '✓' : '✗'}`)
  }

  if (earningsDays !== null) {
    reasonParts.push(`Earnings in ${earningsDays}d`)
  }

  if (researchFlags.length > 0) {
    reasonParts.push(`Flags ${researchFlags.join(',')}`)
  }

  return {
    ticker: history.ticker,
    signalDate,
    label,
    previousLabel: previousLabel ?? undefined,
    researchFlags,
    indicators,
    regime: effectiveRegime,
    earningsWithinWindow: earningsWithinReviewWindow,
    reason: reasonParts.join(' | ')
  }
}
