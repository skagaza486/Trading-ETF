type FinnhubEarningsResponse = {
  earningsCalendar?: Array<{
    date?: string
    symbol?: string
  }>
}

type EarningsCacheEntry = {
  fetchedAt: string
  value: string | null
}

const EARNINGS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function cacheKey(symbol: string, fromDate: string, toDate: string): string {
  return `earningsCache:${symbol}:${fromDate}:${toDate}`
}

function readCache(symbol: string, fromDate: string, toDate: string): EarningsCacheEntry | null {
  if (!canUseStorage()) return null

  const raw = window.localStorage.getItem(cacheKey(symbol, fromDate, toDate))
  if (!raw) return null

  try {
    return JSON.parse(raw) as EarningsCacheEntry
  } catch {
    return null
  }
}

function writeCache(symbol: string, fromDate: string, toDate: string, value: string | null): void {
  if (!canUseStorage()) return

  const entry: EarningsCacheEntry = {
    fetchedAt: new Date().toISOString(),
    value
  }

  window.localStorage.setItem(cacheKey(symbol, fromDate, toDate), JSON.stringify(entry))
}

function isStale(timestamp: string): boolean {
  return Date.now() - new Date(timestamp).getTime() > EARNINGS_CACHE_TTL_MS
}

function isoDate(daysFromNow: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  return date.toISOString().slice(0, 10)
}

async function fetchEarningsDate(symbol: string, fromDate: string, toDate: string): Promise<string | null> {
  const cached = readCache(symbol, fromDate, toDate)
  if (cached && !isStale(cached.fetchedAt)) {
    return cached.value
  }

  const url = `/api/finnhub/calendar/earnings?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&symbol=${encodeURIComponent(symbol)}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (response.status === 503 || response.status === 501) {
    throw new Error('Finnhub earnings API key is not configured.')
  }

  if (!response.ok) {
    throw new Error(`Finnhub returned ${response.status} for ${symbol}`)
  }

  const payload = (await response.json()) as FinnhubEarningsResponse
  const match = payload.earningsCalendar?.find(entry => entry.symbol === symbol && typeof entry.date === 'string')
  const date = match?.date ?? null
  writeCache(symbol, fromDate, toDate, date)
  return date
}

async function fetchAllEarningsDatesInRange(symbol: string, fromDate: string, toDate: string): Promise<string[]> {
  const url = `/api/finnhub/calendar/earnings?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&symbol=${encodeURIComponent(symbol)}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })

  if (response.status === 503 || response.status === 501) {
    throw new Error('Finnhub earnings API key is not configured.')
  }

  if (!response.ok) return []

  const payload = (await response.json()) as FinnhubEarningsResponse
  return (payload.earningsCalendar ?? [])
    .filter(entry => entry.symbol === symbol && typeof entry.date === 'string')
    .map(entry => entry.date as string)
    .sort()
}

export async function fetchHistoricalEarningsMap(
  symbols: string[],
  fromDate: string,
  toDate: string
): Promise<Map<string, string[]>> {
  const uniqueSymbols = [...new Set(symbols)]
  const results = await Promise.allSettled(
    uniqueSymbols.map(async symbol => [symbol, await fetchAllEarningsDatesInRange(symbol, fromDate, toDate)] as const)
  )
  const map = new Map<string, string[]>()

  results.forEach((result, index) => {
    const symbol = uniqueSymbols[index]
    map.set(symbol, result.status === 'fulfilled' ? result.value[1] : [])
  })

  return map
}

export async function fetchEarningsCalendar(symbols: string[], daysForward = 21): Promise<Map<string, string | null>> {
  const uniqueSymbols = [...new Set(symbols)]
  const fromDate = isoDate(0)
  const toDate = isoDate(daysForward)
  const results = await Promise.allSettled(
    uniqueSymbols.map(async symbol => [symbol, await fetchEarningsDate(symbol, fromDate, toDate)] as const)
  )
  const earningsMap = new Map<string, string | null>()

  results.forEach((result, index) => {
    const symbol = uniqueSymbols[index]

    if (result.status === 'fulfilled') {
      earningsMap.set(result.value[0], result.value[1])
      return
    }

    earningsMap.set(symbol, null)
  })

  return earningsMap
}
