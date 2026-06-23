import type { TickerHistory } from '../types/indicator'
import type { RegimeClass, ResearchFlag, StockSignal } from '../types/signal'
import { classifyRegime } from './marketRegime'
import { computeADX, computeATR, computeCLV, computeCMF, computeEMA, computeEMASlope, computeMACD, computeOBV, computeRSI, computeRVOL } from './indicatorEngine'
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
  const ema150 = computeEMA(history.bars, 150)
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

  // recentPullbackNearEma20: any of last 5 bars (excluding today) had low <= EMA20 * 1.02
  // Used by LONG_BOUNCE to confirm a multi-day pullback occurred before today's bounce
  const recentPullbackNearEma20 = (() => {
    const n = bars.length
    if (n < 7) return null
    for (let i = n - 6; i < n - 1; i++) {
      const e = ema20[i]
      if (e !== null && bars[i].low <= e * 1.02) return true
    }
    return false
  })()

  // HYP-016: count of RVOL < 0.8 days in last 10 bars (excl. today) — compression persistence
  const lowRvolDaysInWindow = (() => {
    const window = rvol.slice(-11, -1).filter((v): v is number => v !== null)
    if (window.length < 5) return null
    return window.filter(v => v < 0.8).length
  })()

  // HYP-016: ATR today < ATR 5 bars ago — volatility still contracting
  const atrCompressing = (() => {
    const n = atr.length
    if (n < 6) return null
    const today = atr[n - 1]
    const fiveAgo = atr[n - 6]
    if (today === null || fiveAgo === null) return null
    return today < fiveAgo
  })()

  // HYP-017: count of RVOL < 0.8 days in last 5 bars (excl. today) — pre-breakout base quality
  const priorBaseStreak = (() => {
    const window = rvol.slice(-6, -1).filter((v): v is number => v !== null)
    if (window.length < 3) return null
    return window.filter(v => v < 0.8).length
  })()

  // HYP-018: avg RVOL during pullback bars (bars where low <= EMA20 * 1.02) — volume dry-up check
  const pullbackRvolAvg = (() => {
    const n = bars.length
    if (n < 7) return null
    const pullbackRvols: number[] = []
    for (let i = n - 6; i < n - 1; i++) {
      const e = ema20[i]
      const r = rvol[i]
      if (e !== null && r !== null && bars[i].low <= e * 1.02) {
        pullbackRvols.push(r)
      }
    }
    if (pullbackRvols.length === 0) return null
    return pullbackRvols.reduce((s, v) => s + v, 0) / pullbackRvols.length
  })()

  // HYP-019: RSI trend over last 3 days — momentum direction persistence
  const rsiSlope3 = (() => {
    const len = rsi14.length
    if (len < 4) return null
    const today = rsi14[len - 1]
    const threeDaysAgo = rsi14[len - 4]
    if (today === null || threeDaysAgo === null) return null
    return today - threeDaysAgo
  })()

  // HYP-020: ADX(14) — trend strength filter; >25 = trending, signals have higher follow-through
  const adx14 = (() => {
    const adxSeries = computeADX(history.bars, 14)
    return adxSeries.at(-1) ?? null
  })()

  // HYP-022: Up-day vs Down-day volume ratio over last 50 bars — net institutional accumulation proxy
  const udVolRatio50 = (() => {
    const sample = bars.slice(-50)
    if (sample.length < 20) return null
    let upVol = 0
    let downVol = 0
    for (const bar of sample) {
      if (bar.close >= bar.open) upVol += bar.volume
      else downVol += bar.volume
    }
    return downVol === 0 ? null : upVol / downVol
  })()

  // HYP-021: NR7 — today's range is the smallest of the last 7 bars (volatility compression before expansion)
  const nr7 = (() => {
    if (bars.length < 7) return null
    const last7 = bars.slice(-7)
    const todayRange = last7[last7.length - 1].high - last7[last7.length - 1].low
    const minRange = Math.min(...last7.map(b => b.high - b.low))
    return todayRange === minRange
  })()

  // Extended-from-pivot flag: close >5% above 20-day prior high — chasing risk
  const extendedFromPivot = (() => {
    if (bars.length < 21) return null
    const pivot = Math.max(...bars.slice(-21, -1).map(b => b.high))
    return latestClose > pivot * 1.05
  })()

  // HYP-026/027: RS Line = close / SPY_close — IBD relative strength ratio series
  // Aligns bars by position (same assumption as computeRelativeStrengthVsSpy).
  // rsLineAboveEma: RS trend health flag used as LONG_BOUNCE排雷 condition
  // rsLineNewHigh120d: research tag for Meta-Labeling feature accumulation (HYP-027)
  const { rsLine, rsLineEma50, rsLineAboveEma, rsLineNewHigh120d } = (() => {
    const spyBars = benchmarks.SPY?.bars
    if (!spyBars || spyBars.length === 0) {
      return { rsLine: null, rsLineEma50: null, rsLineAboveEma: null, rsLineNewHigh120d: null }
    }

    const len = Math.min(bars.length, spyBars.length)
    const rsLineSeries: number[] = []
    for (let i = bars.length - len; i < bars.length; i++) {
      const spyIdx = spyBars.length - len + (i - (bars.length - len))
      const spyClose = spyBars[spyIdx]?.close
      if (spyClose && spyClose > 0) rsLineSeries.push(bars[i].close / spyClose)
    }

    if (rsLineSeries.length === 0) {
      return { rsLine: null, rsLineEma50: null, rsLineAboveEma: null, rsLineNewHigh120d: null }
    }

    const latestRsLine = rsLineSeries.at(-1) ?? null

    const ema50Series = computeEMA(
      rsLineSeries.map((v, i) => ({ date: '', open: v, high: v, low: v, close: v, volume: i })),
      50
    )
    const latestRsLineEma50 = ema50Series.at(-1) ?? null

    const rsLineAboveEmaVal =
      latestRsLine !== null && latestRsLineEma50 !== null
        ? latestRsLine > latestRsLineEma50
        : null

    const rsLineNewHigh120dVal =
      latestRsLine !== null && rsLineSeries.length >= 2
        ? latestRsLine >= Math.max(...rsLineSeries.slice(-Math.min(120, rsLineSeries.length)))
        : null

    return {
      rsLine: latestRsLine,
      rsLineEma50: latestRsLineEma50,
      rsLineAboveEma: rsLineAboveEmaVal,
      rsLineNewHigh120d: rsLineNewHigh120dVal
    }
  })()

  return {
    close: latestClose,
    low: latestLow,
    ema20: latestValue(ema20),
    ema50: latestValue(ema50),
    ema150: latestValue(ema150),
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
    nearHigh52w: high52w !== null ? latestClose >= high52w * 0.75 : null,
    recentPullbackNearEma20,
    lowRvolDaysInWindow,
    atrCompressing,
    priorBaseStreak,
    pullbackRvolAvg,
    rsiSlope3,
    adx14,
    udVolRatio50,
    nr7,
    extendedFromPivot,
    rsLine,
    rsLineEma50,
    rsLineAboveEma,
    rsLineNewHigh120d
  }
}

export function classifyStock(
  history: TickerHistory,
  benchmarks: Record<string, TickerHistory>,
  earningsDate: string | null,
  regime: RegimeClass,
  tier: 1 | 2 = 1
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
        nearHigh52w: null,
        recentPullbackNearEma20: null,
        lowRvolDaysInWindow: null,
        atrCompressing: null,
        priorBaseStreak: null,
        pullbackRvolAvg: null,
        rsiSlope3: null,
        ema150: null,
        adx14: null,
        udVolRatio50: null,
        nr7: null,
        extendedFromPivot: null,
        rsLine: null,
        rsLineEma50: null,
        rsLineAboveEma: null,
        rsLineNewHigh120d: null
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
      previousEarningsDays !== null && previousEarningsDays <= 3,
      tier
    )
  }

  let label = resolveStockLabel(indicators, effectiveRegime, previousLabel, earningsWithinReviewWindow, tier)

  if (earningsWithinDangerWindow && (label === 'LONG_BREAK' || label === 'LONG_VCP' || label === 'LONG_BOUNCE')) {
    label = 'LONG_BASE'
  }

  if (earningsWithinDangerWindow && label === 'SHORT_BREAK') {
    label = 'SHORT_BASE'
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

// ── Fundamentals Filter (T2.7–T2.8) ──────────────────────────────────

export type FundamentalRow = {
  ticker: string
  sector: string | null
  roe: number | null
  pe: number | null
  forward_pe: number | null
  peg: number | null
  debt_to_equity: number | null
  revenue_growth_yoy: number | null
  earnings_growth_yoy: number | null
  free_cash_flow: number | null
  profitable: number | null
  market_cap: number | null
}

export type ScreenerCandidate = {
  ticker: string
  name: string
  sector: string
  label: string
  rsRank: number | null
  close: number | null
  reason: string
  // Fundamentals
  roe: number | null
  pe: number | null
  debtToEquity: number | null
  profitable: boolean | null
  marketCap: number | null
  // Filter reasons
  passedFundamentals: boolean
  fundamentalsNote: string
}

const LONG_ENTRY_LABELS = new Set(['LONG_BREAK', 'LONG_VCP', 'LONG_BOUNCE'])

/**
 * Fundamentals gates (EXECUTION_PLAN §4, Steps 3–4):
 * - Profitable (trailing EPS > 0)
 * - ROE ≥ 12%
 * - P/E ≤ 40 (skip if null — some sectors e.g. financials)
 * - D/E ≤ 2.0 (skip if null)
 * These are conservative filters for a 3–6 month hold.
 * ⚠️ yfinance provides current/TTM data only — no PIT history.
 */
function checkFundamentals(f: FundamentalRow | null): { passed: boolean; note: string } {
  if (!f) return { passed: false, note: 'No fundamentals data' }

  const failures: string[] = []

  if (f.profitable !== 1) failures.push('not profitable')
  if (f.roe !== null && f.roe < 0.12) failures.push(`ROE ${(f.roe * 100).toFixed(0)}%`)
  if (f.pe !== null && f.pe > 40) failures.push(`P/E ${f.pe.toFixed(0)}`)
  if (f.debt_to_equity !== null && f.debt_to_equity > 2.0) failures.push(`D/E ${f.debt_to_equity.toFixed(1)}`)

  if (failures.length === 0) return { passed: true, note: 'OK' }
  return { passed: false, note: failures.join(', ') }
}

/**
 * Run fundamentals + liquidity filter over snapshot stocks that carry a LONG entry label.
 * Pure function: takes stocks from snapshot + fundamentals from D1, returns ranked candidates.
 */
export function runScreenerFilter(
  stocks: Array<{
    ticker: string
    name: string
    sector: string
    label: string
    rsRank: number | null
    close: number | null
    reason: string
  }>,
  fundamentals: Map<string, FundamentalRow>,
): ScreenerCandidate[] {
  return stocks
    .filter(s => LONG_ENTRY_LABELS.has(s.label))
    .map(s => {
      const f = fundamentals.get(s.ticker) ?? null
      const { passed, note } = checkFundamentals(f)

      return {
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
        label: s.label,
        rsRank: s.rsRank,
        close: s.close,
        reason: s.reason,
        roe: f?.roe ?? null,
        pe: f?.pe ?? null,
        debtToEquity: f?.debt_to_equity ?? null,
        profitable: f?.profitable === 1,
        marketCap: f?.market_cap ?? null,
        passedFundamentals: passed,
        fundamentalsNote: note,
      }
    })
    .sort((a, b) => {
      // Sort: fundamentals-passed first, then by RS rank descending
      if (a.passedFundamentals !== b.passedFundamentals) return a.passedFundamentals ? -1 : 1
      return (b.rsRank ?? 0) - (a.rsRank ?? 0)
    })
}
