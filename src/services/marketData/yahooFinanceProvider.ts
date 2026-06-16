import type { FxProvider } from './FxProvider'
import type { PriceProvider } from './PriceProvider'
import type { FxRate } from '../../types/fx'
import type { ETFPriceData } from '../../types/price'
import {
  markFxAsCached,
  markPriceAsCached,
  readFxCache,
  readPriceCache,
  writeFxCache,
  writePriceCache
} from './marketDataCache'

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

const YAHOO_BASE = '/api/yahoo/v8/finance/chart'

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

function parseChartData(ticker: string, payload: YahooChartResponse): ETFPriceData {
  const result = payload.chart.result?.[0]

  if (!result) {
    throw new Error(payload.chart.error?.description ?? `No Yahoo chart result for ${ticker}`)
  }

  const closes = result.indicators.quote?.[0]?.close?.filter((value): value is number => {
    return typeof value === 'number' && Number.isFinite(value)
  }) ?? []

  if (closes.length === 0) {
    throw new Error(`No close prices returned for ${ticker}`)
  }

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

async function fetchYahooChart(ticker: string): Promise<YahooChartResponse> {
  const response = await fetch(`${YAHOO_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=1y`)

  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status} for ${ticker}`)
  }

  return response.json() as Promise<YahooChartResponse>
}

export class YahooFinancePriceProvider implements PriceProvider {
  async getPrice(ticker: string): Promise<ETFPriceData> {
    try {
      const payload = await fetchYahooChart(ticker)
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

export class YahooFinanceFxProvider implements FxProvider {
  async getUsdHkd(): Promise<FxRate> {
    try {
      const payload = await fetchYahooChart('HKD=X')
      const result = parseChartData('HKD=X', payload)
      const rate: FxRate = {
        pair: 'USDHKD',
        rate: result.currentPrice,
        fetchedAt: result.fetchedAt,
        isManualOverride: false,
        isStale: false,
        source: 'YAHOO_FINANCE'
      }
      writeFxCache(rate)
      return rate
    } catch (error) {
      const cached = readFxCache()
      if (cached) return markFxAsCached(cached.data)
      throw error
    }
  }
}
