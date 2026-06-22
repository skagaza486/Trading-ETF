import type { TickerHistory } from '../types/indicator'
import type { ETFReplayWeek } from '../types/replay'
import { classifyRegime } from './marketRegime'
import { classifyETF } from './etfWeeklyEngine'
import { aggregateWeeklyHistory, latestBar, percentChange, sliceHistoryThroughDate } from './historyUtils'
import { computeEMA } from './indicatorEngine'
import type { RegimeInputs } from '../types/market'

export type ETFSignalRow = {
  ticker: string
  weekEndingDate: string
  label: ETFReplayWeek['label']
  indicatorsJson: string
  regime: string
  closeAtSignal: number | null
  prevClose: number | null
  recentCloseJson: string
  ret1w: number | null
  ret4w: number | null
}

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

// Build historical ETF weekly signals for all tickers over weeksBack weeks.
// Used by the ETF backfill endpoint; produces ETFSignalRow[] ready for D1 upsert.
export function buildHistoricalETFSignals(
  histories: Record<string, TickerHistory>,
  tickers: string[],
  weeksBack: number
): ETFSignalRow[] {
  const rows: ETFSignalRow[] = []

  for (const ticker of tickers) {
    const history = histories[ticker]
    if (!history) continue

    const weeklyHistory = aggregateWeeklyHistory(history)
    if (weeklyHistory.bars.length < 40) continue

    const startIndex = Math.max(39, weeklyHistory.bars.length - weeksBack)

    for (let offset = 0; offset < weeklyHistory.bars.length - startIndex; offset++) {
      const absoluteIndex = startIndex + offset
      const bar = weeklyHistory.bars[absoluteIndex]
      if (!bar) continue

      const slicedHistory = sliceHistoryThroughDate(history, bar.date)
      const slicedBenchmarks = Object.fromEntries(
        Object.entries(histories).map(([t, h]) => [t, sliceHistoryThroughDate(h, bar.date)])
      )
      const regime = deriveRegimeFromHistories(slicedBenchmarks)
      const recommendation = classifyETF(slicedHistory, slicedBenchmarks, regime)

      const currentClose = weeklyHistory.bars[absoluteIndex]?.close ?? null
      const prevClose = absoluteIndex > 0 ? weeklyHistory.bars[absoluteIndex - 1]?.close ?? null : null
      const recentClose = weeklyHistory.bars
        .slice(Math.max(0, absoluteIndex - 4), absoluteIndex + 1)
        .map(bar => bar.close)
        .reverse()
      const close1w = weeklyHistory.bars[absoluteIndex + 1]?.close ?? NaN
      const close4w = weeklyHistory.bars[absoluteIndex + 4]?.close ?? NaN

      rows.push({
        ticker,
        weekEndingDate: bar.date,
        label: recommendation.label,
        indicatorsJson: JSON.stringify(recommendation.indicators),
        regime: regime,
        closeAtSignal: currentClose,
        prevClose,
        recentCloseJson: JSON.stringify(recentClose),
        ret1w: percentChange(close1w, currentClose ?? NaN),
        ret4w: percentChange(close4w, currentClose ?? NaN)
      })
    }
  }

  return rows
}

// Settle ret1w / ret4w for existing D1 rows that were written without forward prices.
// Reads outstanding rows from D1, looks up prices, updates them in-place.
export async function settleETFForwardReturns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  histories: Record<string, TickerHistory>,
  asOfDate: string
): Promise<number> {
  // Fetch rows missing either forward return, within the last 6 weeks
  const sixWeeksAgo = new Date(new Date(asOfDate).getTime() - 42 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)

  const { results } = await db
    .prepare(
      `SELECT ticker, week_ending_date, close_at_signal
       FROM etf_signals
       WHERE week_ending_date >= ?
         AND (ret1w IS NULL OR ret4w IS NULL)`
    )
    .bind(sixWeeksAgo)
    .all() as { results: { ticker: string; week_ending_date: string; close_at_signal: number | null }[] }

  if (results.length === 0) return 0

  const updates: ReturnType<typeof db.prepare>[] = []

  for (const row of results) {
    const history = histories[row.ticker]
    if (!history) continue

    const weeklyHistory = aggregateWeeklyHistory(history)
    const rowDate = row.week_ending_date

    const signalIdx = weeklyHistory.bars.findIndex(b => b.date === rowDate)
    if (signalIdx === -1) continue

    const close0 = row.close_at_signal ?? weeklyHistory.bars[signalIdx]?.close
    if (!close0) continue

    const close1w = weeklyHistory.bars[signalIdx + 1]?.close ?? NaN
    const close4w = weeklyHistory.bars[signalIdx + 4]?.close ?? NaN

    const ret1w = percentChange(close1w, close0)
    const ret4w = percentChange(close4w, close0)

    if (ret1w === null && ret4w === null) continue

    updates.push(
      db.prepare(
        `UPDATE etf_signals SET ret1w = ?, ret4w = ? WHERE ticker = ? AND week_ending_date = ?`
      ).bind(ret1w, ret4w, row.ticker, row.week_ending_date)
    )
  }

  if (updates.length > 0) {
    for (let i = 0; i < updates.length; i += 100) {
      await db.batch(updates.slice(i, i + 100))
    }
  }

  return updates.length
}
