import type { ETFWithPrice } from '../types/etf'
import type { HoldingValuation, ReturnTrackerResult } from '../types/portfolio'
import type { Signal } from '../types/signal'

export function getDataReviewSignal(input: {
  etf: ETFWithPrice
  holding: HoldingValuation
  createdAt: string
}): Signal | null {
  if (!input.holding.isPriceMissing && !input.holding.isPriceStale) return null

  return {
    id: `data-review:${input.holding.ticker}`,
    ticker: input.holding.ticker,
    action: 'REVIEW',
    priority: input.holding.isPriceMissing ? 'HIGH' : 'MEDIUM',
    reason: input.holding.isPriceMissing
      ? 'Missing current price; buy/sell signal blocked.'
      : 'Price is stale; review data before acting.',
    ruleId: input.holding.isPriceMissing ? 'DATA_MISSING' : 'DATA_STALE',
    category: input.etf.category,
    currentWeight: input.holding.marketValueWeight,
    targetWeight: 0,
    weightGap: 0,
    blockedBy: ['DATA_REVIEW'],
    createdAt: input.createdAt
  }
}

export function getConcentrationSignal(input: {
  etf: ETFWithPrice
  holding: HoldingValuation
  targetWeight: number
  maxSingleEtfWeight: number
  createdAt: string
}): Signal | null {
  if (input.holding.marketValueWeight <= input.maxSingleEtfWeight) return null

  return {
    id: `concentration:${input.holding.ticker}`,
    ticker: input.holding.ticker,
    action: 'REVIEW',
    priority: 'HIGH',
    reason: `Position is above the ${input.maxSingleEtfWeight}% single ETF concentration limit.`,
    ruleId: 'CONCENTRATION_REVIEW',
    category: input.etf.category,
    currentWeight: input.holding.marketValueWeight,
    targetWeight: input.targetWeight,
    weightGap: input.targetWeight - input.holding.marketValueWeight,
    blockedBy: ['CONCENTRATION_LIMIT'],
    createdAt: input.createdAt
  }
}

export function getReturnStatusSignal(input: {
  etf: ETFWithPrice
  holding: HoldingValuation
  targetWeight: number
  returnTracker: ReturnTrackerResult
  createdAt: string
}): Signal | null {
  if (input.returnTracker.status !== 'FAR_BEHIND') return null

  return {
    id: `return-review:${input.holding.ticker}`,
    ticker: input.holding.ticker,
    action: 'REVIEW',
    priority: 'HIGH',
    reason: 'Portfolio is far behind target; run strategy review before adding risk.',
    ruleId: 'FAR_BEHIND_REVIEW',
    category: input.etf.category,
    currentWeight: input.holding.marketValueWeight,
    targetWeight: input.targetWeight,
    weightGap: input.targetWeight - input.holding.marketValueWeight,
    blockedBy: ['RETURN_STATUS_REVIEW'],
    createdAt: input.createdAt
  }
}
