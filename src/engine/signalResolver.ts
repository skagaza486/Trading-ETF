import type { ETFWithPrice } from '../types/etf'
import type { HoldingValuation } from '../types/portfolio'
import type { Signal, SignalPriority } from '../types/signal'
import type { RebalanceAssessment } from './rebalance'

function priorityForGap(weightGap: number): SignalPriority {
  const absGap = Math.abs(weightGap)
  if (absGap >= 10) return 'HIGH'
  if (absGap >= 5) return 'MEDIUM'
  return 'LOW'
}

export function resolveSignal(input: {
  etf: ETFWithPrice
  holding: HoldingValuation
  rebalance: RebalanceAssessment
  opportunityScore: number
  rebalanceScore: number
  blockers: string[]
  createdAt: string
}): Signal {
  const { rebalance } = input
  const suggestedAmountHkd =
    input.holding.currentValueHkd === null
      ? undefined
      : Math.abs(rebalance.weightGap / 100) *
        (input.holding.currentValueHkd / Math.max(input.holding.marketValueWeight / 100, 0.01))

  if (rebalance.rawAction === 'ADD' && input.blockers.length > 0) {
    return {
      id: `wait:${input.holding.ticker}`,
      ticker: input.holding.ticker,
      action: 'WAIT',
      priority: priorityForGap(rebalance.weightGap),
      reason: `ADD blocked by ${input.blockers.join(', ')}.`,
      ruleId: 'REGIME_SUPPRESSION',
      category: input.etf.category,
      currentWeight: rebalance.currentWeight,
      targetWeight: rebalance.targetWeight,
      weightGap: rebalance.weightGap,
      suggestedAmountHkd,
      blockedBy: input.blockers,
      createdAt: input.createdAt
    }
  }

  if (rebalance.rawAction === 'ADD' && input.opportunityScore < 45) {
    return {
      id: `wait-score:${input.holding.ticker}`,
      ticker: input.holding.ticker,
      action: 'WAIT',
      priority: priorityForGap(rebalance.weightGap),
      reason: `Underweight, but opportunity score is weak (${input.opportunityScore.toFixed(0)}).`,
      ruleId: 'LOW_OPPORTUNITY_SCORE',
      category: input.etf.category,
      currentWeight: rebalance.currentWeight,
      targetWeight: rebalance.targetWeight,
      weightGap: rebalance.weightGap,
      suggestedAmountHkd,
      blockedBy: ['LOW_OPPORTUNITY_SCORE'],
      createdAt: input.createdAt
    }
  }

  return {
    id: `${rebalance.rawAction.toLowerCase()}:${input.holding.ticker}`,
    ticker: input.holding.ticker,
    action: rebalance.rawAction,
    priority: priorityForGap(rebalance.weightGap),
    reason:
      rebalance.rawAction === 'HOLD'
        ? `Within target range. Rebalance score ${input.rebalanceScore.toFixed(0)}.`
        : `${rebalance.rawAction} based on ${rebalance.weightGap.toFixed(1)}% target gap.`,
    ruleId: 'REBALANCE_RULE',
    category: input.etf.category,
    currentWeight: rebalance.currentWeight,
    targetWeight: rebalance.targetWeight,
    weightGap: rebalance.weightGap,
    suggestedAmountHkd,
    createdAt: input.createdAt
  }
}

export function sortSignals(signals: Signal[]): Signal[] {
  const priorityOrder: Record<SignalPriority, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2
  }

  const actionOrder: Record<Signal['action'], number> = {
    REVIEW: 0,
    REDUCE: 1,
    TRIM: 2,
    WAIT: 3,
    ADD: 4,
    WATCH: 5,
    HOLD: 6
  }

  return [...signals].sort((a, b) => {
    return priorityOrder[a.priority] - priorityOrder[b.priority] || actionOrder[a.action] - actionOrder[b.action]
  })
}
