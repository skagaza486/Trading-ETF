import { useEffect, useState } from 'react'

export type FinancialNewsItem = {
  id: number
  headline: string
  source: string
  url: string
  datetime: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; items: FinancialNewsItem[] }

function isoDate(daysFromNow: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  return date.toISOString().slice(0, 10)
}

export function useFinancialNews(ticker: string | null, limit = 3): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!ticker) {
      setState({ status: 'error', message: 'ticker required' })
      return
    }

    let cancelled = false
    const from = isoDate(-7)
    const to = isoDate(0)

    fetch(`/api/finnhub/company-news?symbol=${encodeURIComponent(ticker)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => r.json())
      .then((data: unknown) => {
        if (cancelled) return
        if (!Array.isArray(data)) {
          setState({ status: 'error', message: 'News unavailable' })
          return
        }

        const items = (data as Array<Record<string, unknown>>)
          .filter(row => typeof row.headline === 'string' && typeof row.url === 'string')
          .slice(0, limit)
          .map((row, index) => ({
            id: typeof row.id === 'number' ? row.id : index,
            headline: row.headline as string,
            source: typeof row.source === 'string' ? row.source : 'Unknown',
            url: row.url as string,
            datetime: typeof row.datetime === 'number'
              ? new Date((row.datetime as number) * 1000).toISOString()
              : new Date().toISOString(),
          }))

        setState({ status: 'ok', items })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: 'error', message: error.message ?? 'Fetch failed' })
      })

    return () => { cancelled = true }
  }, [ticker, limit])

  return state
}
