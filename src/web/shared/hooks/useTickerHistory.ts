import { useEffect, useState } from 'react'

export type TickerHistoryRow = {
  signalDate: string
  label: string
  closeAtSignal: number | null
  ret5d: number | null
  ret5dVsSpy: number | null
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: TickerHistoryRow[]; ticker: string }

export function useTickerHistory(ticker: string): State {
  const [state, setState] = useState<State>({ status: 'idle' })

  useEffect(() => {
    if (!ticker) { setState({ status: 'idle' }); return }
    let cancelled = false
    setState({ status: 'loading' })

    fetch(`/api/d1/ticker-history?ticker=${encodeURIComponent(ticker)}&days=90`)
      .then(r => r.json())
      .then((data: { rows?: unknown[]; ticker?: string; error?: string }) => {
        if (cancelled) return
        if (data.error || !Array.isArray(data.rows)) {
          setState({ status: 'error', message: data.error ?? 'Unavailable' })
          return
        }
        const rows: TickerHistoryRow[] = (data.rows as Record<string, unknown>[]).map(row => ({
          signalDate:  row.signal_date as string,
          label:       row.label as string,
          closeAtSignal: row.close_at_signal as number | null,
          ret5d:       row.ret5d as number | null,
          ret5dVsSpy:  row.ret5d_vs_spy as number | null,
        }))
        setState({ status: 'ok', rows, ticker: data.ticker ?? ticker })
      })
      .catch(e => {
        if (!cancelled) setState({ status: 'error', message: e.message ?? 'Fetch failed' })
      })

    return () => { cancelled = true }
  }, [ticker])

  return state
}
