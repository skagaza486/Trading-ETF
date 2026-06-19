import { useEffect, useState } from 'react'

export type SignalStat = {
  label: string
  n: number
  avgRet5d: number | null
  avgRet10d: number | null
  avgVsSpy: number | null
  winRate: number | null
  avgMfe5d: number | null
  avgMae5d: number | null
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; stats: SignalStat[]; since: string; days: number }

export function useSignalStats(days: number = 90): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetch(`/api/d1/signal-stats?days=${days}`)
      .then(r => r.json())
      .then((data: { stats?: unknown[]; since?: string; days?: number; error?: string }) => {
        if (cancelled) return
        if (data.error || !Array.isArray(data.stats)) {
          setState({ status: 'error', message: data.error ?? 'Stats unavailable' })
          return
        }
        const stats: SignalStat[] = (data.stats as Record<string, unknown>[]).map(row => ({
          label:     row.label as string,
          n:         row.n as number,
          avgRet5d:  row.avg_ret5d as number | null,
          avgRet10d: row.avg_ret10d as number | null,
          avgVsSpy:  row.avg_vs_spy as number | null,
          winRate:   row.win_rate as number | null,
          avgMfe5d:  row.avg_mfe5d as number | null,
          avgMae5d:  row.avg_mae5d as number | null,
        }))
        setState({ status: 'ok', stats, since: data.since ?? '', days: data.days ?? days })
      })
      .catch(e => {
        if (!cancelled) setState({ status: 'error', message: e.message ?? 'Fetch failed' })
      })

    return () => { cancelled = true }
  }, [days])

  return state
}
