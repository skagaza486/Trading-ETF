export type OHLCVBar = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  adjClose?: number
}

export type TickerHistory = {
  ticker: string
  bars: OHLCVBar[]
  source: 'yahoo' | 'polygon' | 'alphavantage' | 'stooq' | 'mock'
  fetchedAt: string
}
