import type { ForwardReturnRecord } from '../types/research'
import type { RegimeClass, StockSignalLabel } from '../types/signal'

export type GateStatus = 'PASS' | 'FAIL' | 'INSUFFICIENT'

export type RobustnessWindowSpec = {
  id: '6m' | '12m' | '18m'
  label: string
  lookbackDays: number
}

export type RollingWindowSummary = {
  window: RobustnessWindowSpec
  totalWindows: number
  gate2PassWindows: number
  gate3PassWindows: number
  gate6PassWindows: number
  fullPassWindows: number
  avgRet5dVsSpy: number | null
}

export type LabelRobustnessResult = {
  label: StockSignalLabel
  summaries: RollingWindowSummary[]
}

export type LabelGateResult = {
  label: StockSignalLabel
  count: number
  avgRet5d: number | null
  medianRet5d: number | null
  avgRet5dVsSpy: number | null
  avgMae5d: number | null
  regimeSplit: Record<RegimeClass, { count: number; avgRet5d: number | null }>
  firstHalfAvgRet5d: number | null
  secondHalfAvgRet5d: number | null
  gate1SampleSize: boolean
  gate2Direction: boolean | null
  gate3VsSpy: boolean | null
  gate4Consistent: boolean | null
  gate5NeutralRegime: boolean | null
  gate6Mae: boolean | null
  stopLossHitRate: number | null
  gate7StopLossHitRate: boolean | null
  status: GateStatus
}

const DIRECTIONAL_LABELS: ReadonlySet<StockSignalLabel> = new Set([
  'LONG_WATCH',
  'LONG_SETUP',
  'LONG_VCP',
  'LONG_PULLBACK',
  'LONG_CONFIRM',
  'UP_PROMOTION',
  'SHORT_WATCH',
  'SHORT_SETUP',
  'SHORT_CONFIRM',
  'DOWN_PROMOTION',
])

const SHORT_LABELS: ReadonlySet<StockSignalLabel> = new Set([
  'SHORT_WATCH',
  'SHORT_SETUP',
  'SHORT_CONFIRM',
  'DOWN_PROMOTION',
])

const LABEL_ORDER: StockSignalLabel[] = [
  'LONG_CONFIRM',
  'UP_PROMOTION',
  'LONG_VCP',
  'LONG_SETUP',
  'LONG_PULLBACK',
  'LONG_WATCH',
  'SHORT_CONFIRM',
  'DOWN_PROMOTION',
  'SHORT_SETUP',
  'SHORT_WATCH',
]

export const DEFAULT_ROBUSTNESS_WINDOWS: RobustnessWindowSpec[] = [
  { id: '6m', label: '6M Rolling', lookbackDays: 182 },
  { id: '12m', label: '12M Rolling', lookbackDays: 365 },
  { id: '18m', label: '18M Rolling', lookbackDays: 548 },
]

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function compact<T>(values: (T | null | undefined)[]): T[] {
  return values.filter((v): v is T => v !== null && v !== undefined)
}

function isoDateDaysBefore(anchorDate: string, days: number): string {
  const date = new Date(`${anchorDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export function evaluateAllGates(records: ForwardReturnRecord[]): LabelGateResult[] {
  const presentLabels = new Set(records.map(r => r.label))
  const labels = LABEL_ORDER.filter(label => DIRECTIONAL_LABELS.has(label) && presentLabels.has(label))

  return labels.map(label => {
    const rows = records.filter(r => r.label === label)
    const isShort = SHORT_LABELS.has(label)
    const count = rows.length

    const ret5dValues = compact(rows.map(r => r.ret5d))
    const ret5dVsSpyValues = compact(rows.map(r => r.ret5dVsSpy))
    const mae5dValues = compact(rows.map(r => r.mae5d))

    const avgRet5d = mean(ret5dValues)
    const medianRet5d = median(ret5dValues)
    const avgRet5dVsSpy = mean(ret5dVsSpyValues)
    const avgMae5d = mean(mae5dValues)

    // Regime split
    const regimeClasses: RegimeClass[] = ['long_friendly', 'neutral', 'short_friendly']
    const regimeSplit: Record<RegimeClass, { count: number; avgRet5d: number | null }> = {
      long_friendly: { count: 0, avgRet5d: null },
      neutral: { count: 0, avgRet5d: null },
      short_friendly: { count: 0, avgRet5d: null },
    }
    for (const regime of regimeClasses) {
      const regimeRows = rows.filter(r => r.regimeAtSignal === regime)
      regimeSplit[regime] = { count: regimeRows.length, avgRet5d: mean(compact(regimeRows.map(r => r.ret5d))) }
    }

    // Consistency: first half vs second half sorted by date
    const sorted = [...rows].sort((a, b) => a.signalDate.localeCompare(b.signalDate))
    const mid = Math.floor(sorted.length / 2)
    const firstHalfAvgRet5d = mean(compact(sorted.slice(0, mid).map(r => r.ret5d)))
    const secondHalfAvgRet5d = mean(compact(sorted.slice(mid).map(r => r.ret5d)))

    // Gate evaluations
    const gate1SampleSize = count >= 100

    const hasEnoughForEval = count >= 10

    const gate2Direction = hasEnoughForEval
      ? (isShort ? (avgRet5d !== null && avgRet5d < 0) : (avgRet5d !== null && avgRet5d > 0))
      : null

    const gate3VsSpy = hasEnoughForEval
      ? (isShort
          ? (avgRet5dVsSpy !== null && avgRet5dVsSpy < -0.005)
          : (avgRet5dVsSpy !== null && avgRet5dVsSpy > 0.005))
      : null

    const gate4Consistent = (firstHalfAvgRet5d !== null && secondHalfAvgRet5d !== null && count >= 20)
      ? (isShort
          ? (firstHalfAvgRet5d < 0 && secondHalfAvgRet5d < 0)
          : (firstHalfAvgRet5d > 0 && secondHalfAvgRet5d > 0))
      : null

    const neutralRows = rows.filter(r => r.regimeAtSignal === 'neutral')
    const neutralAvgRet5d = mean(compact(neutralRows.map(r => r.ret5d)))
    const gate5NeutralRegime = neutralRows.length >= 5
      ? (isShort
          ? (neutralAvgRet5d !== null && neutralAvgRet5d < 0)
          : (neutralAvgRet5d !== null && neutralAvgRet5d > 0))
      : null

    const gate6Mae = hasEnoughForEval
      ? (avgMae5d !== null && avgMae5d < 0.03)
      : null

    // G7: Stop loss hit rate < 30% (long signals only — records where stopLossHit !== null)
    const stopLossRows = rows.filter(r => r.stopLossHit !== null)
    const stopLossHitCount = stopLossRows.filter(r => r.stopLossHit === true).length
    const stopLossHitRate = stopLossRows.length >= 10 ? stopLossHitCount / stopLossRows.length : null
    const gate7StopLossHitRate = stopLossHitRate !== null ? stopLossHitRate < 0.3 : null

    // Overall status
    let status: GateStatus
    if (!gate1SampleSize) {
      status = 'INSUFFICIENT'
    } else if (
      gate2Direction === true &&
      gate3VsSpy === true &&
      gate4Consistent === true &&
      gate5NeutralRegime !== false &&
      gate6Mae === true &&
      gate7StopLossHitRate !== false
    ) {
      status = 'PASS'
    } else {
      status = 'FAIL'
    }

    return {
      label,
      count,
      avgRet5d,
      medianRet5d,
      avgRet5dVsSpy,
      avgMae5d,
      regimeSplit,
      firstHalfAvgRet5d,
      secondHalfAvgRet5d,
      gate1SampleSize,
      gate2Direction,
      gate3VsSpy,
      gate4Consistent,
      gate5NeutralRegime,
      gate6Mae,
      stopLossHitRate,
      gate7StopLossHitRate,
      status,
    }
  })
}

export function evaluateRollingWindowRobustness(
  records: ForwardReturnRecord[],
  windows: RobustnessWindowSpec[] = DEFAULT_ROBUSTNESS_WINDOWS,
  stepDays = 63
): LabelRobustnessResult[] {
  if (records.length === 0) return []

  const presentLabels = new Set(records.map(r => r.label))
  const labels = LABEL_ORDER.filter(label => DIRECTIONAL_LABELS.has(label) && presentLabels.has(label))
  const latestDate = records.reduce((max, record) => record.signalDate > max ? record.signalDate : max, records[0]?.signalDate ?? '')
  const earliestDate = records.reduce((min, record) => record.signalDate < min ? record.signalDate : min, records[0]?.signalDate ?? '')

  return labels.map(label => {
    const summaries = windows.map(window => {
      const perWindowResults: LabelGateResult[] = []
      let windowEnd = latestDate

      while (windowEnd >= earliestDate) {
        const windowStart = isoDateDaysBefore(windowEnd, window.lookbackDays)
        const windowRecords = records.filter(record =>
          record.label === label &&
          record.signalDate >= windowStart &&
          record.signalDate <= windowEnd
        )

        if (windowRecords.length > 0) {
          const gateResult = evaluateAllGates(windowRecords).find(result => result.label === label)
          if (gateResult) {
            perWindowResults.push(gateResult)
          }
        }

        const nextWindowEnd = isoDateDaysBefore(windowEnd, stepDays)
        if (nextWindowEnd >= windowEnd) break
        windowEnd = nextWindowEnd
      }

      const avgRet5dVsSpySeries = compact(perWindowResults.map(result => result.avgRet5dVsSpy))

      return {
        window,
        totalWindows: perWindowResults.length,
        gate2PassWindows: perWindowResults.filter(result => result.gate2Direction === true).length,
        gate3PassWindows: perWindowResults.filter(result => result.gate3VsSpy === true).length,
        gate6PassWindows: perWindowResults.filter(result => result.gate6Mae === true).length,
        fullPassWindows: perWindowResults.filter(result => result.status === 'PASS').length,
        avgRet5dVsSpy: mean(avgRet5dVsSpySeries)
      }
    })

    return { label, summaries }
  })
}
