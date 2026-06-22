import { useEffect, useState } from 'react'

export type PerfByPeriodRow = {
  period: string
  n: number
  avgRet5d: number | null
  avgVsSpy: number | null
  winRate: number | null
  avgMfe5d: number | null
  avgMae5d: number | null
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; label: string; rows: PerfByPeriodRow[] }

export function usePerfByPeriod(label: string): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    fetch(`/api/d1/signal-perf-by-period?label=${encodeURIComponent(label)}`)
      .then(r => r.json())
      .then((data: { label?: string; periods?: unknown[]; error?: string }) => {
        if (cancelled) return
        if (data.error || !Array.isArray(data.periods)) {
          setState({ status: 'error' })
          return
        }
        const rows: PerfByPeriodRow[] = (data.periods as Record<string, unknown>[]).map(row => ({
          period:    row.period as string,
          n:         row.n as number,
          avgRet5d:  row.avg_ret5d as number | null,
          avgVsSpy:  row.avg_vs_spy as number | null,
          winRate:   row.win_rate as number | null,
          avgMfe5d:  row.avg_mfe5d as number | null,
          avgMae5d:  row.avg_mae5d as number | null,
        }))
        setState({ status: 'ok', label: data.label ?? label, rows })
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }) })

    return () => { cancelled = true }
  }, [label])

  return state
}
