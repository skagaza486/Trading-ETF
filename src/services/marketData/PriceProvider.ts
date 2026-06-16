import type { ETFPriceData } from '../../types/price'

export interface PriceProvider {
  getPrice(ticker: string): Promise<ETFPriceData>
  getBatch(tickers: string[]): Promise<Map<string, ETFPriceData>>
}
