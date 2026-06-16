import type { Currency } from './etf'

export type Holding = {
  ticker: string
  shares: number
  averageCost: number
  currency: Currency
}

export type Portfolio = {
  id: string
  name: string
  baseCurrency: 'HKD'
  startingPortfolioValueHkd: number
  netContributionHkd: number
  cashBalanceHkd: number
  holdings: Holding[]
}

export type TargetAllocation = {
  ticker: string
  targetWeight: number
}

export type PortfolioPreset = {
  id: string
  name: string
  description: string
  benchmarkLabel: string
  policy: {
    benchmarkReturn: number
    maxDrawdown: number
    minTradeSizeHkd: number
    targetCashReserveWeight: number
    maxSingleEtfWeight: number
    maxNewPositionWeight: number
    reviewFrequency: 'WEEKLY' | 'MONTHLY'
  }
  allocations: TargetAllocation[]
}

export type HoldingValuation = Holding & {
  currentPrice: number | null
  currentValueLocal: number | null
  currentValueHkd: number | null
  marketValueWeight: number
  gainLossLocal: number | null
  gainLossPercent: number | null
  isPriceMissing: boolean
  isPriceStale: boolean
}

export type PortfolioValuation = {
  totalValueHkd: number
  investedValueHkd: number
  cashBalanceHkd: number
  cashWeight: number
  holdings: HoldingValuation[]
  missingPriceTickers: string[]
  stalePriceTickers: string[]
}

export type ReturnStatus = 'NOT_STARTED' | 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'FAR_BEHIND'

export type ReturnTrackerResult = {
  actualYtdReturn: number | null
  proRatedTarget: number
  targetGap: number | null
  status: ReturnStatus
  statusReason: string
}
