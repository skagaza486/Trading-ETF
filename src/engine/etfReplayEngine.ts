import type { TickerHistory } from '../types/indicator'
import type { ETFReplayWeek } from '../types/replay'
import { classifyRegime } from './marketRegime'
import { classifyETF } from './etfWeeklyEngine'
import { aggregateWeeklyHistory, latestBar, percentChange, sliceHistoryThroughDate } from './historyUtils'
import { computeEMA } from './indicatorEngine'
import type { RegimeInputs } from '../types/market'

function latestEmaCheck(history: TickerHistory, period: number): boolean | null {
  if (history.bars.length < period) return null
  const ema = computeEMA(history.bars, period)
  const latest = ema.at(-1)
  const latestClose = latestBar(history)?.close ?? null

  if (latest == null || latestClose === null) return null
  return latestClose >= latest
}

function deriveRegimeFromHistories(benchmarks: Record<string, TickerHistory>): ReturnType<typeof classifyRegime> {
  const inputs: RegimeInputs = {
    spyAboveEma50: benchmarks.SPY ? latestEmaCheck(benchmarks.SPY, 50) : benchmarks.VOO ? latestEmaCheck(benchmarks.VOO, 50) : null,
    qqqAboveEma50: benchmarks.QQQ ? latestEmaCheck(benchmarks.QQQ, 50) : null,
    vixLevel: latestBar(benchmarks['^VIX'])?.close ?? null,
    hkMarketAboveEma40w: benchmarks['2800.HK'] ? latestEmaCheck(benchmarks['2800.HK'], 200) : null,
    goldAboveEma40w: benchmarks.GLD ? latestEmaCheck(benchmarks.GLD, 200) : null,
    rspAboveEma50: benchmarks.RSP ? latestEmaCheck(benchmarks.RSP, 50) : null
  }

  return classifyRegime(inputs)
}

export function replayETF(
  history: TickerHistory,
  benchmarks: Record<string, TickerHistory>,
  weeksBack: number
): ETFReplayWeek[] {
  const weeklyHistory = aggregateWeeklyHistory(history)
  if (weeksBack <= 0 || weeklyHistory.bars.length < 40) return []

  const startIndex = Math.max(39, weeklyHistory.bars.length - weeksBack)

  return weeklyHistory.bars.slice(startIndex).map((bar, offset) => {
    const absoluteIndex = startIndex + offset
    const slicedHistory = sliceHistoryThroughDate(history, bar.date)
    const slicedBenchmarks = Object.fromEntries(
      Object.entries(benchmarks).map(([ticker, benchmarkHistory]) => [ticker, sliceHistoryThroughDate(benchmarkHistory, bar.date)])
    )
    const regime = deriveRegimeFromHistories(slicedBenchmarks)
    const recommendation = classifyETF(slicedHistory, slicedBenchmarks, regime)
    const currentClose = weeklyHistory.bars[absoluteIndex]?.close ?? NaN
    const close1w = weeklyHistory.bars[absoluteIndex + 1]?.close ?? NaN
    const close4w = weeklyHistory.bars[absoluteIndex + 4]?.close ?? NaN

    return {
      weekEndingDate: bar.date,
      ticker: history.ticker,
      label: recommendation.label,
      indicators: recommendation.indicators,
      ret1w: percentChange(close1w, currentClose),
      ret4w: percentChange(close4w, currentClose)
    }
  })
}
