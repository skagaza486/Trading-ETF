import type { PriceProvider } from './PriceProvider'
import type { ETFPriceData } from '../../types/price'

const now = () => new Date().toISOString()

export class MockPriceProvider implements PriceProvider {
  constructor(private readonly prices: Map<string, ETFPriceData> = new Map()) {}

  async getPrice(ticker: string): Promise<ETFPriceData> {
    const existing = this.prices.get(ticker)

    if (existing) {
      return existing
    }

    return {
      ticker,
      currentPrice: 100,
      previousClose: 99,
      movingAverage50: 98,
      movingAverage200: 95,
      oneMonthReturn: 0.01,
      threeMonthReturn: 0.03,
      sixMonthReturn: 0.05,
      oneYearReturn: 0.08,
      fetchedAt: now(),
      isStale: false,
      source: 'MOCK'
    }
  }

  async getBatch(tickers: string[]): Promise<Map<string, ETFPriceData>> {
    const values = await Promise.all(tickers.map(ticker => this.getPrice(ticker)))
    return new Map(values.map(value => [value.ticker, value]))
  }
}
