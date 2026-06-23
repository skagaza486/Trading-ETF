import type { TickerHistory } from '../types/indicator'
import type { ForwardReturnRecord } from '../types/research'
import type { StockSignal } from '../types/signal'
import { findBarIndexByDate, percentChange, sliceHistoryThroughDate } from './historyUtils'
import { classifyRegime, deriveRegimeInputsFromHistories } from './marketRegime'
import { classifyStock } from './stockScreenerEngine'

function isShortLabel(label: StockSignal['label']): boolean {
  return label.startsWith('SHORT')
}

function favorableAndAdverseExcursions(signal: StockSignal, history: TickerHistory, index: number, days: number): {
  mfe: number | null
  mae: number | null
} {
  const nextBar = history.bars[index + 1]
  const entry = nextBar?.open ?? history.bars[index]?.close
  const window = history.bars.slice(index + 1, index + 1 + days)

  if (!entry || window.length === 0) {
    return { mfe: null, mae: null }
  }

  const highest = Math.max(...window.map(bar => bar.high))
  const lowest = Math.min(...window.map(bar => bar.low))

  if (isShortLabel(signal.label)) {
    return {
      mfe: (entry - lowest) / entry,
      mae: (highest - entry) / entry
    }
  }

  return {
    mfe: (highest - entry) / entry,
    mae: (entry - lowest) / entry
  }
}

export function buildForwardReturnRecord(
  signals: StockSignal[],
  histories: Record<string, TickerHistory>
): ForwardReturnRecord[] {
  const spyHistory = histories.SPY

  return signals.flatMap(signal => {
    const history = histories[signal.ticker]
    if (!history) return []

    const signalIndex = findBarIndexByDate(history, signal.signalDate)
    if (signalIndex === -1) return []

    const closeAtSignal = history.bars[signalIndex]?.close ?? 0
    const nextBar = history.bars[signalIndex + 1]
    const nextOpen = nextBar?.open ?? null
    const entryPrice = nextOpen ?? closeAtSignal
    const spyIndex = spyHistory ? findBarIndexByDate(spyHistory, signal.signalDate) : -1
    const returnForDays = (days: number): number | null =>
      percentChange(history.bars[signalIndex + days]?.close ?? NaN, entryPrice)
    const spyReturnForDays = (days: number): number | null => {
      if (!spyHistory || spyIndex === -1) return null
      const spyEntry = spyHistory.bars[spyIndex + 1]?.open ?? spyHistory.bars[spyIndex]?.close ?? NaN
      return percentChange(spyHistory.bars[spyIndex + days]?.close ?? NaN, spyEntry)
    }
    const ret5d = returnForDays(5)
    const ret10d = returnForDays(10)
    const spyRet5d = spyReturnForDays(5)
    const spyRet10d = spyReturnForDays(10)
    // Medium-term horizons (trading-day offsets, consistent with the 5d/10d convention).
    // null until +Nd bars exist; the 2y fetch window supports up to ret12m (252 td).
    const MEDIUM_TERM_DAYS = { ret1m: 21, ret3m: 63, ret6m: 126, ret12m: 252 } as const
    const ret1m = returnForDays(MEDIUM_TERM_DAYS.ret1m)
    const ret3m = returnForDays(MEDIUM_TERM_DAYS.ret3m)
    const ret6m = returnForDays(MEDIUM_TERM_DAYS.ret6m)
    const ret12m = returnForDays(MEDIUM_TERM_DAYS.ret12m)
    const relVsSpy = (ret: number | null, days: number): number | null => {
      const spyRet = spyReturnForDays(days)
      return ret !== null && spyRet !== null ? ret - spyRet : null
    }
    const excursion5d = favorableAndAdverseExcursions(signal, history, signalIndex, 5)
    const excursion10d = favorableAndAdverseExcursions(signal, history, signalIndex, 10)

    // ATR-based dynamic stop loss for long signals: entry - 2×ATR14
    const atrAtSignal = signal.indicators.atr
    const isLong = !isShortLabel(signal.label) &&
      signal.label !== 'NEUTRAL' && signal.label !== 'AVOID_CHOP' &&
      signal.label !== 'REVIEW_DATA' && signal.label !== 'REVIEW_EVENT'
    const suggestedStopLoss = isLong && atrAtSignal !== null ? entryPrice - 2 * atrAtSignal : null
    const window5dBars = history.bars.slice(signalIndex + 1, signalIndex + 6)
    const stopLossHit = suggestedStopLoss !== null && window5dBars.length > 0
      ? window5dBars.some(bar => bar.low <= suggestedStopLoss)
      : null

    return [
      {
        signalDate: signal.signalDate,
        ticker: signal.ticker,
        label: signal.label,
        closeAtSignal,
        nextOpen,
        ret1d: returnForDays(1),
        ret3d: returnForDays(3),
        ret5d,
        ret10d,
        ret5dVsSpy: ret5d !== null && spyRet5d !== null ? ret5d - spyRet5d : null,
        ret10dVsSpy: ret10d !== null && spyRet10d !== null ? ret10d - spyRet10d : null,
        ret1m,
        ret3m,
        ret6m,
        ret12m,
        ret1mVsSpy: relVsSpy(ret1m, MEDIUM_TERM_DAYS.ret1m),
        ret3mVsSpy: relVsSpy(ret3m, MEDIUM_TERM_DAYS.ret3m),
        ret6mVsSpy: relVsSpy(ret6m, MEDIUM_TERM_DAYS.ret6m),
        ret12mVsSpy: relVsSpy(ret12m, MEDIUM_TERM_DAYS.ret12m),
        mfe5d: excursion5d.mfe,
        mfe10d: excursion10d.mfe,
        mae5d: excursion5d.mae,
        mae10d: excursion10d.mae,
        earningsInWindow: signal.earningsWithinWindow,
        regimeAtSignal: signal.regime,
        researchFlags: signal.researchFlags,
        rvolAtSignal: signal.indicators.rvol,
        atrAtSignal,
        suggestedStopLoss,
        stopLossHit
      }
    ]
  })
}

export function buildHistoricalSignals(
  histories: Record<string, TickerHistory>,
  tickers: string[],
  maxSignalBars = 180,
  historicalEarningsMap?: Map<string, string[]>
): StockSignal[] {
  return tickers.flatMap(ticker => {
    const history = histories[ticker]
    if (!history || history.bars.length < 70) return []

    const usableEndIndex = history.bars.length - 10
    const startIndex = Math.max(60, usableEndIndex - maxSignalBars)
    const earningsDates = historicalEarningsMap?.get(ticker) ?? []
    const signals: StockSignal[] = []

    for (let index = startIndex; index < usableEndIndex; index += 1) {
      const signalDate = history.bars[index]?.date
      if (!signalDate) continue

      const slicedHistories = Object.fromEntries(
        Object.entries(histories).map(([historyTicker, currentHistory]) => [
          historyTicker,
          sliceHistoryThroughDate(currentHistory, signalDate)
        ])
      )
      const regime = classifyRegime(deriveRegimeInputsFromHistories(slicedHistories))
      // Find next earnings date after signalDate (dates array is pre-sorted)
      const nextEarnings = earningsDates.find(d => d > signalDate) ?? null
      const signal = classifyStock(slicedHistories[ticker], slicedHistories, nextEarnings, regime)

      if (signal.label !== 'REVIEW_DATA') {
        signals.push(signal)
      }
    }

    return signals
  })
}
