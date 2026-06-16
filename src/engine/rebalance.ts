import type { PortfolioPreset } from '../types/portfolio'
import type { SignalAction } from '../types/signal'

export type RebalanceAssessment = {
  ticker: string
  currentWeight: number
  targetWeight: number
  weightGap: number
  rawAction: SignalAction
}

export function getTargetWeight(preset: PortfolioPreset, ticker: string): number {
  return preset.allocations.find(allocation => allocation.ticker === ticker)?.targetWeight ?? 0
}

export function assessRebalance(input: {
  ticker: string
  currentWeight: number
  targetWeight: number
}): RebalanceAssessment {
  const weightGap = input.targetWeight - input.currentWeight
  const absGap = Math.abs(weightGap)
  let rawAction: SignalAction = 'HOLD'

  if (weightGap > 5) rawAction = 'ADD'
  else if (weightGap < -5) rawAction = 'REDUCE'
  else if (absGap > 2) rawAction = 'WATCH'

  return {
    ticker: input.ticker,
    currentWeight: input.currentWeight,
    targetWeight: input.targetWeight,
    weightGap,
    rawAction
  }
}
