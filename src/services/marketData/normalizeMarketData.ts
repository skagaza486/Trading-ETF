import type { ETF, ETFWithPrice } from '../../types/etf'
import type { FxRate } from '../../types/fx'
import type { ETFPriceData } from '../../types/price'

export type MarketDataSnapshot = {
  etfs: ETFWithPrice[]
  usdHkd: FxRate | null
  missingPriceTickers: string[]
  stalePriceTickers: string[]
}

export function buildMarketDataSnapshot(input: {
  etfs: ETF[]
  prices: Map<string, ETFPriceData>
  usdHkd: FxRate | null
}): MarketDataSnapshot {
  const etfs = input.etfs.map(etf => ({
    ...etf,
    priceData: input.prices.get(etf.ticker) ?? null
  }))

  return {
    etfs,
    usdHkd: input.usdHkd,
    missingPriceTickers: etfs.filter(etf => etf.priceData === null).map(etf => etf.ticker),
    stalePriceTickers: etfs
      .filter(etf => etf.priceData?.isStale)
      .map(etf => etf.ticker)
  }
}
