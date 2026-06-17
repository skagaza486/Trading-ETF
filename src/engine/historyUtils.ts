import type { OHLCVBar, TickerHistory } from '../types/indicator'

export function latestBar(history: TickerHistory): OHLCVBar | null {
  return history.bars.at(-1) ?? null
}

export function closes(history: TickerHistory): number[] {
  return history.bars.map(bar => bar.close)
}

export function highs(history: TickerHistory): number[] {
  return history.bars.map(bar => bar.high)
}

export function lows(history: TickerHistory): number[] {
  return history.bars.map(bar => bar.low)
}

export function volumes(history: TickerHistory): number[] {
  return history.bars.map(bar => bar.volume)
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return (current - previous) / previous
}

export function rollingMean(values: number[], period: number): (number | null)[] {
  const output: (number | null)[] = new Array(values.length).fill(null)
  if (period <= 0) return output

  let windowSum = 0

  for (let index = 0; index < values.length; index += 1) {
    windowSum += values[index]

    if (index >= period) {
      windowSum -= values[index - period]
    }

    if (index >= period - 1) {
      output[index] = windowSum / period
    }
  }

  return output
}

export function sliceHistoryThroughDate(history: TickerHistory, endDate: string): TickerHistory {
  return {
    ...history,
    bars: history.bars.filter(bar => bar.date <= endDate)
  }
}

function weekKey(date: string): string {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCFullYear()}-${value.getUTCMonth()}-${value.getUTCDate() - value.getUTCDay()}`
}

export function aggregateWeeklyHistory(history: TickerHistory): TickerHistory {
  const weeklyBars: OHLCVBar[] = []
  let currentKey: string | null = null
  let currentGroup: OHLCVBar[] = []

  const flushGroup = (): void => {
    if (currentGroup.length === 0) return

    const first = currentGroup[0]
    const last = currentGroup[currentGroup.length - 1]

    weeklyBars.push({
      date: last.date,
      open: first.open,
      high: Math.max(...currentGroup.map(bar => bar.high)),
      low: Math.min(...currentGroup.map(bar => bar.low)),
      close: last.close,
      volume: currentGroup.reduce((sum, bar) => sum + bar.volume, 0),
      adjClose: last.adjClose
    })
  }

  for (const bar of history.bars) {
    const nextKey = weekKey(bar.date)

    if (currentKey !== null && nextKey !== currentKey) {
      flushGroup()
      currentGroup = []
    }

    currentKey = nextKey
    currentGroup.push(bar)
  }

  flushGroup()

  return {
    ...history,
    bars: weeklyBars
  }
}

export function findBarIndexByDate(history: TickerHistory, date: string): number {
  return history.bars.findIndex(bar => bar.date === date)
}

export function daysUntilDate(fromDate: string, targetDate: string): number | null {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime()
  const target = new Date(`${targetDate}T00:00:00Z`).getTime()

  if (Number.isNaN(from) || Number.isNaN(target)) return null

  return Math.round((target - from) / (24 * 60 * 60 * 1000))
}

export function regressionSlope(values: number[]): number | null {
  if (values.length < 2) return null

  const xMean = (values.length - 1) / 2
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length

  let numerator = 0
  let denominator = 0

  values.forEach((value, index) => {
    const xDiff = index - xMean
    numerator += xDiff * (value - yMean)
    denominator += xDiff * xDiff
  })

  if (denominator === 0) return null

  return numerator / denominator
}
