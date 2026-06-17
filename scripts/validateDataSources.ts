type ValidationRow = {
  ticker: string
  bars_returned: number
  newest_date: string
  source: string
  status: 'OK' | 'FAIL'
}

const TICKERS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'TSLA']
const DIRECT_BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']
const YAHOO_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0'
}

type YahooChartResponse = {
  chart: {
    result?: Array<{
      timestamp?: number[]
      indicators: {
        quote?: Array<{
          close?: Array<number | null>
        }>
      }
    }>
    error?: {
      code: string
      description: string
    } | null
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function buildUrls(ticker: string, proxyBaseUrl?: string): string[] {
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`
  const urls: string[] = []

  if (proxyBaseUrl) {
    urls.push(`${trimTrailingSlash(proxyBaseUrl)}${path}`)
  }

  for (const base of DIRECT_BASES) {
    urls.push(`${base}${path}`)
  }

  return urls
}

async function fetchChart(ticker: string, proxyBaseUrl?: string): Promise<YahooChartResponse> {
  let lastError: Error | null = null

  for (const url of buildUrls(ticker, proxyBaseUrl)) {
    try {
      const response = await fetch(url, { headers: YAHOO_HEADERS })

      if (!response.ok) {
        throw new Error(`Yahoo Finance returned ${response.status} for ${ticker}`)
      }

      return (await response.json()) as YahooChartResponse
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`Unknown fetch error for ${ticker}`)
    }
  }

  throw lastError ?? new Error(`Unable to fetch data for ${ticker}`)
}

function extractRecentDates(payload: YahooChartResponse): string[] {
  const result = payload.chart.result?.[0]
  const timestamps = result?.timestamp ?? []
  const closes = result?.indicators.quote?.[0]?.close ?? []
  const dates: string[] = []

  timestamps.forEach((timestamp, index) => {
    const close = closes[index]
    if (typeof close === 'number' && Number.isFinite(close)) {
      dates.push(new Date(timestamp * 1000).toISOString().slice(0, 10))
    }
  })

  return dates.slice(-5)
}

async function validateTicker(ticker: string, proxyBaseUrl?: string): Promise<ValidationRow> {
  try {
    const payload = await fetchChart(ticker, proxyBaseUrl)
    const dates = extractRecentDates(payload)

    return {
      ticker,
      bars_returned: dates.length,
      newest_date: dates.at(-1) ?? 'n/a',
      source: proxyBaseUrl ? 'yahoo-proxy' : 'yahoo',
      status: dates.length > 0 ? 'OK' : 'FAIL'
    }
  } catch {
    return {
      ticker,
      bars_returned: 0,
      newest_date: 'n/a',
      source: proxyBaseUrl ? 'yahoo-proxy' : 'yahoo',
      status: 'FAIL'
    }
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now()
  const proxyBaseUrl = process.env.YAHOO_PROXY_BASE_URL
  const rows = await Promise.all(TICKERS.map(ticker => validateTicker(ticker, proxyBaseUrl)))

  console.table(rows)
  console.log(`Total time taken: ${Date.now() - startedAt}ms`)

  if (rows.some(row => row.bars_returned === 0)) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
