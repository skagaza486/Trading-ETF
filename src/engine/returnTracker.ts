import type { Portfolio, PortfolioValuation, ReturnStatus, ReturnTrackerResult } from '../types/portfolio'

const ANNUAL_TARGET = 0.1

function getElapsedYearRatio(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1)
  const end = new Date(date.getFullYear() + 1, 0, 1)
  return (date.getTime() - start.getTime()) / (end.getTime() - start.getTime())
}

function getReturnStatus(targetGap: number): ReturnStatus {
  if (targetGap > 0.02) return 'AHEAD'
  if (targetGap < -0.05) return 'FAR_BEHIND'
  if (targetGap < -0.02) return 'BEHIND'
  return 'ON_TRACK'
}

export function trackPortfolioReturn(input: {
  portfolio: Portfolio
  valuation: PortfolioValuation
  asOf?: Date
}): ReturnTrackerResult {
  const startingValue = input.portfolio.startingPortfolioValueHkd
  const hasHoldings = input.portfolio.holdings.some(holding => holding.shares > 0)
  const hasTrackedCapital = startingValue > 0 || input.portfolio.netContributionHkd > 0
  const hasFundedCash = input.portfolio.cashBalanceHkd > 0
  const proRatedTarget = ANNUAL_TARGET * getElapsedYearRatio(input.asOf ?? new Date())

  if (!hasHoldings || !hasTrackedCapital || input.valuation.totalValueHkd <= 0) {
    return {
      actualYtdReturn: null,
      proRatedTarget,
      targetGap: null,
      status: 'NOT_STARTED',
      statusReason: hasFundedCash
        ? 'Capital is funded but not deployed into ETF positions yet.'
        : 'No tracked holdings yet. Add holdings or set a starting capital base to begin return tracking.'
    }
  }

  const actualYtdReturn =
    startingValue > 0
      ? (input.valuation.totalValueHkd - startingValue - input.portfolio.netContributionHkd) /
        startingValue
      : 0
  const targetGap = actualYtdReturn - proRatedTarget

  return {
    actualYtdReturn,
    proRatedTarget,
    targetGap,
    status: getReturnStatus(targetGap),
    statusReason: 'Tracking active against the pro-rated annual target.'
  }
}
