import type { TickerHistory } from '../types/indicator'
import type { ETFRecommendation, RegimeClass } from '../types/signal'
import { aggregateWeeklyHistory, closes, latestBar, percentChange, regressionSlope, rollingMean } from './historyUtils'

function computeVolatility13w(weeklyCloses: number[]): number | null {
  if (weeklyCloses.length < 14) return null
  const sample = weeklyCloses.slice(-14)
  const returns: number[] = []
  for (let i = 1; i < sample.length; i++) {
    if (sample[i - 1] !== 0) returns.push((sample[i] - sample[i - 1]) / sample[i - 1])
  }
  if (returns.length < 5) return null
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance)
}

const SAFE_HAVEN_TICKERS = new Set(['GLD', 'IAU', 'GLDM', 'SGOV', 'SHY', 'IEF', 'TLT', 'BIL', 'TIP'])

function latestValue<T>(values: (T | null)[]): T | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index]
  }
  return null
}

function classifyBaseLabel(input: {
  return13w: number | null
  return26w: number | null
  priceVs10wMa: number | null
  priceVs40wMa: number | null
  ma10Slope: number | null
  relStrengthVsSpy: number | null
  rsSlope: number | null
}): ETFRecommendation['label'] {
  const { return13w, return26w, priceVs10wMa, priceVs40wMa, ma10Slope, relStrengthVsSpy, rsSlope } = input

  if (
    priceVs40wMa !== null &&
    priceVs40wMa < 1 &&
    (return13w ?? 0) <= 0 &&
    (return26w ?? 0) <= 0 &&
    (relStrengthVsSpy ?? 0) <= 0
  ) {
    return 'AVOID'
  }

  if (
    priceVs10wMa !== null &&
    priceVs10wMa >= 1 &&
    priceVs40wMa !== null &&
    priceVs40wMa >= 1 &&
    (return13w ?? 0) > 0 &&
    ((ma10Slope ?? 0) > 0 || (return26w ?? 0) > 0) &&
    (relStrengthVsSpy ?? 0) > 0 &&
    (rsSlope === null || rsSlope > 0)
  ) {
    return 'FAVOUR'
  }

  if (
    priceVs10wMa !== null &&
    priceVs10wMa >= 0.99 &&
    ((ma10Slope ?? 0) > 0 || (return13w ?? 0) > 0 || (relStrengthVsSpy ?? 0) > 0)
  ) {
    return 'WATCH'
  }

  return 'WAIT'
}

function downgradeForRegime(label: ETFRecommendation['label'], ticker: string, regime: RegimeClass): ETFRecommendation['label'] {
  if (label === 'REVIEW' || regime === 'neutral' || SAFE_HAVEN_TICKERS.has(ticker)) return label

  if (regime === 'short_friendly') {
    if (label === 'FAVOUR') return 'WAIT'
    if (label === 'WATCH') return 'WAIT'
  }

  return label
}

export function classifyETF(
  history: TickerHistory,
  benchmarks: Record<string, TickerHistory>,
  regime: RegimeClass
): ETFRecommendation {
  const weeklyHistory = aggregateWeeklyHistory(history)
  const weeklyBars = weeklyHistory.bars
  const lastWeeklyBar = latestBar(weeklyHistory)
  const spyHistory = benchmarks.SPY ?? benchmarks.VOO
  const spyWeekly = spyHistory ? aggregateWeeklyHistory(spyHistory) : null
  const vixLevel = latestBar(benchmarks['^VIX'])?.close ?? null

  if (!lastWeeklyBar || weeklyBars.length < 40 || !spyWeekly || spyWeekly.bars.length < 26) {
    return {
      ticker: history.ticker,
      label: 'REVIEW',
      weekEndingDate: lastWeeklyBar?.date ?? '',
      indicators: {
        return13w: null,
        return26w: null,
        priceVs10wMa: null,
        priceVs40wMa: null,
        relStrengthVsSpy: null,
        rsSlope: null,
        vixLevel,
        rankScore: null
      },
      reason: 'Insufficient weekly history or missing benchmark data.'
    }
  }

  const weeklyCloses = closes(weeklyHistory)
  const spyCloses = closes(spyWeekly)
  const sgovHistory = benchmarks.SGOV
  const sgovWeekly = sgovHistory ? aggregateWeeklyHistory(sgovHistory) : null
  const sgovReturn13w = sgovWeekly
    ? percentChange(closes(sgovWeekly).at(-1) ?? NaN, closes(sgovWeekly).at(-14) ?? NaN)
    : null
  const ma10 = rollingMean(weeklyCloses, 10)
  const ma40 = rollingMean(weeklyCloses, 40)
  const latestClose = weeklyCloses.at(-1) ?? null
  const latestMa10 = latestValue(ma10)
  const latestMa40 = latestValue(ma40)
  const previousMa10 = ma10.at(-2) ?? null
  const return13w = percentChange(weeklyCloses.at(-1) ?? NaN, weeklyCloses.at(-14) ?? NaN)
  const return26w = percentChange(weeklyCloses.at(-1) ?? NaN, weeklyCloses.at(-27) ?? NaN)
  const spyReturn13w = percentChange(spyCloses.at(-1) ?? NaN, spyCloses.at(-14) ?? NaN)
  const relStrengthVsSpy =
    return13w !== null && spyReturn13w !== null ? return13w - spyReturn13w : null
  const volatility13w = computeVolatility13w(weeklyCloses)
  const rankScore =
    return13w !== null && sgovReturn13w !== null && volatility13w !== null && volatility13w > 0
      ? (return13w - sgovReturn13w) / volatility13w
      : null
  const priceVs10wMa = latestClose !== null && latestMa10 !== null && latestMa10 !== 0 ? latestClose / latestMa10 : null
  const priceVs40wMa = latestClose !== null && latestMa40 !== null && latestMa40 !== 0 ? latestClose / latestMa40 : null
  const ma10Slope =
    latestMa10 !== null && previousMa10 !== null && previousMa10 !== 0 ? (latestMa10 - previousMa10) / previousMa10 : null

  // RS Ratio Line: ETF close / SPY close per weekly bar (Mansfield RS slope)
  const spyWeeklyCloseMap = new Map<string, number>()
  for (const bar of spyWeekly.bars) {
    spyWeeklyCloseMap.set(bar.date, bar.close)
  }
  const rsRatioLine: number[] = []
  for (const bar of weeklyBars) {
    const spyClose = spyWeeklyCloseMap.get(bar.date)
    if (spyClose && spyClose > 0) {
      rsRatioLine.push(bar.close / spyClose)
    }
  }
  const rsSlope = rsRatioLine.length >= 10 ? regressionSlope(rsRatioLine.slice(-10)) : null

  const baseLabel = classifyBaseLabel({
    return13w,
    return26w,
    priceVs10wMa,
    priceVs40wMa,
    ma10Slope,
    relStrengthVsSpy,
    rsSlope
  })
  const label = vixLevel !== null && vixLevel > 25 ? downgradeForRegime(baseLabel, history.ticker, 'short_friendly') : downgradeForRegime(baseLabel, history.ticker, regime)

  const reasonParts = [
    `13W return ${return13w === null ? 'n/a' : `${(return13w * 100).toFixed(1)}%`}`,
    `26W return ${return26w === null ? 'n/a' : `${(return26w * 100).toFixed(1)}%`}`,
    `Price/10W MA ${priceVs10wMa === null ? 'n/a' : priceVs10wMa.toFixed(2)}`,
    `Price/40W MA ${priceVs40wMa === null ? 'n/a' : priceVs40wMa.toFixed(2)}`,
    `RS vs SPY ${relStrengthVsSpy === null ? 'n/a' : `${(relStrengthVsSpy * 100).toFixed(1)}%`}`,
    `RS Slope ${rsSlope === null ? 'n/a' : rsSlope > 0 ? '↑' : '↓'}`,
    `Regime ${regime}`
  ]

  return {
    ticker: history.ticker,
    label,
    weekEndingDate: lastWeeklyBar.date,
    indicators: {
      return13w,
      return26w,
      priceVs10wMa,
      priceVs40wMa,
      relStrengthVsSpy,
      rsSlope,
      vixLevel,
      rankScore
    },
    reason: reasonParts.join(' | ')
  }
}
