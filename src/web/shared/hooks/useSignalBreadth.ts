import { useEffect, useState } from 'react'

export type BreadthDay = {
  date: string
  strongBull: number
  base: number
  bear: number
  total: number
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: BreadthDay[]; since: string }

export function useSignalBreadth(days: number = 30): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetch(`/api/d1/signal-breadth?days=${days}`)
      .then(r => r.json())
      .then((data: { rows?: unknown[]; since?: string; error?: string }) => {
        if (cancelled) return
        if (data.error || !Array.isArray(data.rows)) {
          setState({ status: 'error', message: data.error ?? 'Unavailable' })
          return
        }
        const rows: BreadthDay[] = (data.rows as Record<string, unknown>[]).map(row => ({
          date:       row.date as string,
          strongBull: (row.strong_bull as number) ?? 0,
          base:       (row.base as number) ?? 0,
          bear:       (row.bear as number) ?? 0,
          total:      (row.total as number) ?? 0,
        }))
        setState({ status: 'ok', rows, since: data.since ?? '' })
      })
      .catch(e => {
        if (!cancelled) setState({ status: 'error', message: e.message ?? 'Fetch failed' })
      })

    return () => { cancelled = true }
  }, [days])

  return state
}
