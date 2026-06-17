import type { OHLCVBar, TickerHistory } from '../../types/indicator'
import type { ETFPriceData } from '../../types/price'
import type { PriceProvider } from './PriceProvider'
import { markPriceAsCached, readPriceCache, writePriceCache } from './marketDataCache'

type YahooChartResponse = {
  chart: {
    result?: Array<{
      meta: {
        regularMarketPrice?: number
        chartPreviousClose?: number
        previousClose?: number
      }
      timestamp?: number[]
      indicators: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
        adjclose?: Array<{
          adjclose?: Array<number | null>
        }>
      }
    }>
    error?: {
      code: string
      description: string
    } | null
  }
}

export type YahooHistoryOptions = {
  baseUrl?: string
  interval?: string
  range?: string
}

const DEFAULT_PROXY_BASE = '/api/yahoo'
const DIRECT_BASES = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']
const YAHOO_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0'
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function buildYahooUrls(ticker: string, options: YahooHistoryOptions): string[] {
  const interval = options.interval ?? '1d'
  const range = options.range ?? '1y'
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
  const urls = [options.baseUrl ? `${trimTrailingSlash(options.baseUrl)}${path}` : `${DEFAULT_PROXY_BASE}${path}`]

  for (const base of DIRECT_BASES) {
    urls.push(`${base}${path}`)
  }

  return urls
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function periodReturn(closes: number[], daysBack: number): number {
  if (closes.length <= daysBack) return 0

  const current = closes[closes.length - 1]
  const previous = closes[closes.length - 1 - daysBack]

  if (!current || !previous) return 0
  return (current - previous) / previous
}

function ensureResult(ticker: string, payload: YahooChartResponse) {
  const result = payload.chart.result?.[0]

  if (!result) {
    throw new Error(payload.chart.error?.description ?? `No Yahoo chart result for ${ticker}`)
  }

  return result
}

function toIsoDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

function parseHistoryBars(ticker: string, payload: YahooChartResponse): OHLCVBar[] {
  const result = ensureResult(ticker, payload)
  const timestamps = result.timestamp ?? []
  const quote = result.indicators.quote?.[0]
  const adjClose = result.indicators.adjclose?.[0]?.adjclose ?? []

  return timestamps.flatMap((timestamp, index) => {
    const close = quote?.close?.[index]
    if (typeof close !== 'number' || !Number.isFinite(close)) return []

    const open = quote?.open?.[index]
    const high = quote?.high?.[index]
    const low = quote?.low?.[index]
    const volume = quote?.volume?.[index]
    const adjustedClose = adjClose[index]

    return [
      {
        date: toIsoDate(timestamp),
        open: typeof open === 'number' && Number.isFinite(open) ? open : close,
        high: typeof high === 'number' && Number.isFinite(high) ? high : close,
        low: typeof low === 'number' && Number.isFinite(low) ? low : close,
        close,
        volume: typeof volume === 'number' && Number.isFinite(volume) ? volume : 0,
        adjClose:
          typeof adjustedClose === 'number' && Number.isFinite(adjustedClose) ? adjustedClose : undefined
      }
    ]
  })
}

function parseChartData(ticker: string, payload: YahooChartResponse): ETFPriceData {
  const closes = parseHistoryBars(ticker, payload).map(bar => bar.close)

  if (closes.length === 0) {
    throw new Error(`No close prices returned for ${ticker}`)
  }

  const result = ensureResult(ticker, payload)
  const currentPrice = result.meta.regularMarketPrice ?? closes[closes.length - 1]
  const previousClose =
    result.meta.previousClose ?? result.meta.chartPreviousClose ?? closes[closes.length - 2]

  if (!currentPrice || !previousClose) {
    throw new Error(`Missing current or previous price for ${ticker}`)
  }

  return {
    ticker,
    currentPrice,
    previousClose,
    movingAverage50: average(closes.slice(-50)),
    movingAverage200: average(closes.slice(-200)),
    oneMonthReturn: periodReturn(closes, 21),
    threeMonthReturn: periodReturn(closes, 63),
    sixMonthReturn: periodReturn(closes, 126),
    oneYearReturn: periodReturn(closes, 252),
    fetchedAt: new Date().toISOString(),
    isStale: false,
    source: 'YAHOO_FINANCE'
  }
}

export async function fetchYahooChart(ticker: string, options: YahooHistoryOptions = {}): Promise<YahooChartResponse> {
  let lastError: Error | null = null

  for (const url of buildYahooUrls(ticker, options)) {
    try {
      const response = await fetch(url, { headers: YAHOO_HEADERS })

      if (!response.ok) {
        throw new Error(`Yahoo Finance returned ${response.status} for ${ticker}`)
      }

      return (await response.json()) as YahooChartResponse
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`Unknown Yahoo Finance error for ${ticker}`)
    }
  }

  throw lastError ?? new Error(`Unable to fetch Yahoo Finance data for ${ticker}`)
}

export async function fetchYahooTickerHistory(
  ticker: string,
  options: YahooHistoryOptions = {}
): Promise<TickerHistory> {
  const payload = await fetchYahooChart(ticker, options)
  const bars = parseHistoryBars(ticker, payload)

  return {
    ticker,
    bars,
    source: 'yahoo',
    fetchedAt: new Date().toISOString()
  }
}

export class YahooFinancePriceProvider implements PriceProvider {
  constructor(private readonly options: YahooHistoryOptions = {}) {}

  async getPrice(ticker: string): Promise<ETFPriceData> {
    try {
      const payload = await fetchYahooChart(ticker, this.options)
      const data = parseChartData(ticker, payload)
      writePriceCache(ticker, data)
      return data
    } catch (error) {
      const cached = readPriceCache(ticker)
      if (cached) return markPriceAsCached(cached.data)
      throw error
    }
  }

  async getBatch(tickers: string[]): Promise<Map<string, ETFPriceData>> {
    const results = await Promise.allSettled(tickers.map(ticker => this.getPrice(ticker)))
    const prices = new Map<string, ETFPriceData>()

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        prices.set(tickers[index], result.value)
      }
    })

    return prices
  }
}
