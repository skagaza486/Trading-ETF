export type FxRate = {
  pair: 'USDHKD'
  rate: number
  fetchedAt: string
  isManualOverride: boolean
  isStale: boolean
  source: 'YAHOO_FINANCE' | 'MANUAL' | 'CACHE'
}

export type FxCache = {
  pair: 'USDHKD'
  data: FxRate
  fetchedAt: string
  lastError?: string
}
