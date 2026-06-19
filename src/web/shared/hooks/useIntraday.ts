import { useState, useEffect } from 'react'
import { fetchYahooTickerHistory } from '../../../services/marketData/yahooFinanceProvider'
import type { OHLCVBar } from '../../../types/indicator'

export type TimeFrame = '1D' | '5D' | '1M' | '3M' | '1Y'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; bars: OHLCVBar[] }

const TF_OPTIONS: Record<TimeFrame, { interval: string; range: string }> = {
  '1D': { interval: '5m',  range: '1d' },
  '5D': { interval: '15m', range: '5d' },
  '1M': { interval: '1d',  range: '1mo' },
  '3M': { interval: '1d',  range: '3mo' },
  '1Y': { interval: '1d',  range: '1y' },
}

export function useIntraday(ticker: string, timeframe: TimeFrame) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!ticker) { setState({ status: 'idle' }); return }
    let cancelled = false
    setState({ status: 'loading' })
    const opts = TF_OPTIONS[timeframe]
    fetchYahooTickerHistory(ticker, opts).then(history => {
      if (cancelled) return
      setState({ status: 'ok', bars: history.bars })
    }).catch(err => {
      if (!cancelled) setState({ status: 'error', message: String(err) })
    })
    return () => { cancelled = true }
  }, [ticker, timeframe])

  return state
}
