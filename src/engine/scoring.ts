import type { ETFWithPrice } from '../types/etf'
import type { MarketRegime } from '../types/market'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function calculateRebalanceScore(weightGap: number): number {
  return clamp(Math.abs(weightGap) * 10, 0, 100)
}

export function calculateOpportunityScore(input: {
  etf: ETFWithPrice
  regime: MarketRegime
}): number {
  const price = input.etf.priceData
  if (!price) return 0

  const momentumScore = clamp(((price.threeMonthReturn + price.sixMonthReturn) / 2) * 400 + 50, 0, 100)
  const trendScore = price.currentPrice >= price.movingAverage200 ? 100 : 30
  const regimeScore =
    input.regime === 'RISK_ON'
      ? 85
      : input.regime === 'NEUTRAL'
        ? 65
        : input.etf.category === 'US_TREASURY' || input.etf.category === 'GOLD'
          ? 70
          : 25

  return momentumScore * 0.4 + trendScore * 0.25 + regimeScore * 0.35
}
