export type ETFPriceData = {
  ticker: string
  currentPrice: number
  previousClose: number
  movingAverage50: number
  movingAverage200: number
  oneMonthReturn: number
  threeMonthReturn: number
  sixMonthReturn: number
  oneYearReturn: number
  fetchedAt: string
  isStale: boolean
  source: 'YAHOO_FINANCE' | 'MOCK' | 'CACHE'
}

export type PriceCache = {
  ticker: string
  data: ETFPriceData
  fetchedAt: string
  lastError?: string
}
