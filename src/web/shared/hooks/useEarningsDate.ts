import { useEffect, useState } from 'react'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; date: string | null }

function isoDate(daysFromNow: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  return date.toISOString().slice(0, 10)
}

export function useEarningsDate(ticker: string | null, daysForward = 90): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!ticker) {
      setState({ status: 'error', message: 'ticker required' })
      return
    }

    let cancelled = false
    const from = isoDate(0)
    const to = isoDate(daysForward)

    fetch(`/api/finnhub/calendar/earnings?symbol=${encodeURIComponent(ticker)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => r.json())
      .then((data: { earningsCalendar?: Array<{ date?: string; symbol?: string }> }) => {
        if (cancelled) return
        const match = data.earningsCalendar?.find(entry => entry.symbol === ticker && typeof entry.date === 'string')
        setState({ status: 'ok', date: match?.date ?? null })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: 'error', message: error.message ?? 'Fetch failed' })
      })

    return () => { cancelled = true }
  }, [ticker, daysForward])

  return state
}
