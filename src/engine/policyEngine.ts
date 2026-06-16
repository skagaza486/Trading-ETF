import type { Portfolio, PortfolioPreset, PortfolioValuation } from '../types/portfolio'
import type { Signal } from '../types/signal'

function appendReason(reason: string, addition: string): string {
  return reason.endsWith('.') ? `${reason} ${addition}` : `${reason}. ${addition}`
}

function mergeBlockers(existing: string[] | undefined, blocker: string): string[] {
  return existing?.includes(blocker) ? existing : [...(existing ?? []), blocker]
}

export function applyPortfolioPolicy(input: {
  portfolio: Portfolio
  preset: PortfolioPreset
  valuation: PortfolioValuation
  signals: Signal[]
}): Signal[] {
  const totalValueHkd = input.valuation.totalValueHkd
  if (totalValueHkd <= 0) return input.signals

  const reserveTargetHkd = (input.preset.policy.targetCashReserveWeight / 100) * totalValueHkd
  let remainingDeployableCashHkd = Math.max(input.portfolio.cashBalanceHkd - reserveTargetHkd, 0)

  return input.signals.map(signal => {
    const isAddSide = signal.targetWeight > signal.currentWeight
    const isReduceSide = signal.currentWeight > signal.targetWeight

    if (!isAddSide && !isReduceSide) {
      return signal
    }

    const fullGapAmountHkd = Math.abs(signal.weightGap / 100) * totalValueHkd
    const isNewPosition = signal.currentWeight === 0 && isAddSide
    let suggestedAmountHkd = signal.suggestedAmountHkd ?? fullGapAmountHkd

    if (isNewPosition) {
      const maxStarterAmountHkd = (input.preset.policy.maxNewPositionWeight / 100) * totalValueHkd
      suggestedAmountHkd = Math.min(suggestedAmountHkd, maxStarterAmountHkd)
    }

    if (isAddSide) {
      if (remainingDeployableCashHkd <= 0) {
        return {
          ...signal,
          action: signal.action === 'REVIEW' ? signal.action : 'WAIT',
          reason: appendReason(
            signal.reason,
            `Blocked by cash reserve policy. Keep at least ${input.preset.policy.targetCashReserveWeight}% in cash.`
          ),
          suggestedAmountHkd: 0,
          suggestedPostTradeWeight: signal.currentWeight,
          blockedBy: mergeBlockers(signal.blockedBy, 'CASH_RESERVE_POLICY')
        }
      }

      suggestedAmountHkd = Math.min(suggestedAmountHkd, remainingDeployableCashHkd)
      remainingDeployableCashHkd = Math.max(remainingDeployableCashHkd - suggestedAmountHkd, 0)
    }

    const tradeWeight = totalValueHkd > 0 ? (suggestedAmountHkd / totalValueHkd) * 100 : 0
    const suggestedPostTradeWeight = isAddSide
      ? Math.min(signal.currentWeight + tradeWeight, signal.targetWeight)
      : Math.max(signal.currentWeight - tradeWeight, signal.targetWeight)

    if (suggestedAmountHkd < input.preset.policy.minTradeSizeHkd) {
      return {
        ...signal,
        action: signal.action === 'REVIEW' || signal.action === 'WAIT' ? signal.action : 'WATCH',
        reason: appendReason(
          signal.reason,
          `Gap remains, but the trade is below the HK$${input.preset.policy.minTradeSizeHkd.toLocaleString()} minimum size.`
        ),
        suggestedAmountHkd,
        suggestedPostTradeWeight
      }
    }

    if (isNewPosition && suggestedAmountHkd < fullGapAmountHkd) {
      return {
        ...signal,
        suggestedAmountHkd,
        suggestedPostTradeWeight,
        reason: appendReason(
          signal.reason,
          `Stage the entry first. Cap new positions at ${input.preset.policy.maxNewPositionWeight}% of portfolio value.`
        )
      }
    }

    if (isAddSide && suggestedAmountHkd < fullGapAmountHkd) {
      return {
        ...signal,
        suggestedAmountHkd,
        suggestedPostTradeWeight,
        reason: appendReason(
          signal.reason,
          `Sized down to respect the ${input.preset.policy.targetCashReserveWeight}% cash reserve.`
        )
      }
    }

    return {
      ...signal,
      suggestedAmountHkd,
      suggestedPostTradeWeight
    }
  })
}
