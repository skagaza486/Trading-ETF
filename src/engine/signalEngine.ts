import type { MarketDataSnapshot } from '../services/marketData/normalizeMarketData'
import type { RegimeInputs } from '../types/market'
import type { Portfolio, PortfolioPreset, ReturnTrackerResult } from '../types/portfolio'
import type { Signal } from '../types/signal'
import { classifyMarketRegime, deriveRegimeInputs, getAddBlockers } from './marketRegime'
import { applyPortfolioPolicy } from './policyEngine'
import { calculatePortfolioValuation } from './portfolioValuation'
import { assessRebalance, getTargetWeight } from './rebalance'
import { getConcentrationSignal, getDataReviewSignal, getReturnStatusSignal } from './riskGuards'
import { calculateOpportunityScore, calculateRebalanceScore } from './scoring'
import { resolveSignal, sortSignals } from './signalResolver'
import { trackPortfolioReturn } from './returnTracker'

export type SignalEngineResult = {
  finalSignals: Signal[]
  signalFeed: Signal[]
  returnTracker: ReturnTrackerResult
  marketRegime: ReturnType<typeof classifyMarketRegime>
  highPriorityCount: number
  blockedSignalCount: number
  portfolioValueHkd: number
}

export function runSignalEngine(input: {
  portfolio: Portfolio
  preset: PortfolioPreset
  marketData: MarketDataSnapshot
  regimeInputs?: RegimeInputs
  asOf?: Date
}): SignalEngineResult {
  const createdAt = (input.asOf ?? new Date()).toISOString()
  const valuation = calculatePortfolioValuation({
    portfolio: input.portfolio,
    etfs: input.marketData.etfs,
    usdHkd: input.marketData.usdHkd
  })
  const returnTracker = trackPortfolioReturn({
    portfolio: input.portfolio,
    valuation,
    asOf: input.asOf
  })
  const regimeInputs = input.regimeInputs ?? deriveRegimeInputs(input.marketData.etfs)
  const marketRegime = classifyMarketRegime(regimeInputs)
  const etfByTicker = new Map(input.marketData.etfs.map(etf => [etf.ticker, etf]))
  const heldTickers = new Set(valuation.holdings.map(holding => holding.ticker))
  const capitalBaseHkd = Math.max(
    valuation.totalValueHkd,
    input.portfolio.startingPortfolioValueHkd + Math.max(input.portfolio.netContributionHkd, 0)
  )

  const holdingSignals = valuation.holdings.map(holding => {
    const etf = etfByTicker.get(holding.ticker)

    if (!etf) {
      return {
        id: `unknown:${holding.ticker}`,
        ticker: holding.ticker,
        action: 'REVIEW',
        priority: 'HIGH',
        reason: 'Ticker is not defined in ETF universe.',
        ruleId: 'UNKNOWN_TICKER',
        category: 'US_EQUITY_CORE',
        currentWeight: holding.marketValueWeight,
        targetWeight: 0,
        weightGap: 0,
        blockedBy: ['DATA_REVIEW'],
        createdAt
      } satisfies Signal
    }

    const targetWeight = getTargetWeight(input.preset, holding.ticker)
    const dataReview = getDataReviewSignal({ etf, holding, createdAt })
    if (dataReview) return dataReview

    const concentrationReview = getConcentrationSignal({
      etf,
      holding,
      targetWeight,
      maxSingleEtfWeight: input.preset.policy.maxSingleEtfWeight,
      createdAt
    })
    if (concentrationReview) return concentrationReview

    const returnReview = getReturnStatusSignal({
      etf,
      holding,
      targetWeight,
      returnTracker,
      createdAt
    })
    if (returnReview && ['US_EQUITY_CORE', 'SECTOR', 'HK_CHINA', 'HY_BOND'].includes(etf.category)) {
      return returnReview
    }

    const rebalance = assessRebalance({
      ticker: holding.ticker,
      currentWeight: holding.marketValueWeight,
      targetWeight
    })
    const blockers = getAddBlockers({ etf, regimeInputs, regime: marketRegime })
    const opportunityScore = calculateOpportunityScore({ etf, regime: marketRegime })
    const rebalanceScore = calculateRebalanceScore(rebalance.weightGap)

    return resolveSignal({
      etf,
      holding,
      rebalance,
      blockers,
      opportunityScore,
      rebalanceScore,
      createdAt
    })
  })

  const starterSignals = input.preset.allocations
    .filter(allocation => allocation.targetWeight > 0 && !heldTickers.has(allocation.ticker))
    .map(allocation => {
      const etf = etfByTicker.get(allocation.ticker)

      if (!etf) {
        return {
          id: `starter-unknown:${allocation.ticker}`,
          ticker: allocation.ticker,
          action: 'REVIEW',
          priority: 'HIGH',
          reason: 'Preset includes a ticker that is not defined in the ETF universe.',
          ruleId: 'STARTER_UNKNOWN_TICKER',
          category: 'US_EQUITY_CORE',
          currentWeight: 0,
          targetWeight: allocation.targetWeight,
          weightGap: allocation.targetWeight,
          blockedBy: ['DATA_REVIEW'],
          createdAt
        } satisfies Signal
      }

      if (!etf.priceData || etf.priceData.isStale) {
        return {
          id: `starter-review:${allocation.ticker}`,
          ticker: allocation.ticker,
          action: 'REVIEW',
          priority: allocation.targetWeight >= 15 ? 'HIGH' : 'MEDIUM',
          reason: 'No holding yet, but price data is unavailable or stale.',
          ruleId: 'STARTER_DATA_REVIEW',
          category: etf.category,
          currentWeight: 0,
          targetWeight: allocation.targetWeight,
          weightGap: allocation.targetWeight,
          blockedBy: ['DATA_REVIEW'],
          createdAt
        } satisfies Signal
      }

      const blockers = getAddBlockers({ etf, regimeInputs, regime: marketRegime })
      const opportunityScore = calculateOpportunityScore({ etf, regime: marketRegime })
      const suggestedAmountHkd = capitalBaseHkd > 0 ? (allocation.targetWeight / 100) * capitalBaseHkd : undefined

      if (blockers.length > 0) {
        return {
          id: `starter-wait:${allocation.ticker}`,
          ticker: allocation.ticker,
          action: 'WAIT',
          priority: allocation.targetWeight >= 15 ? 'HIGH' : 'MEDIUM',
          reason: `Starter allocation is blocked by ${blockers.join(', ')}.`,
          ruleId: 'STARTER_REGIME_SUPPRESSION',
          category: etf.category,
          currentWeight: 0,
          targetWeight: allocation.targetWeight,
          weightGap: allocation.targetWeight,
          suggestedAmountHkd,
          blockedBy: blockers,
          createdAt
        } satisfies Signal
      }

      if (opportunityScore < 45) {
        return {
          id: `starter-score:${allocation.ticker}`,
          ticker: allocation.ticker,
          action: 'WAIT',
          priority: allocation.targetWeight >= 15 ? 'HIGH' : 'MEDIUM',
          reason: `Starter allocation is planned, but current opportunity score is weak (${opportunityScore.toFixed(0)}).`,
          ruleId: 'STARTER_LOW_OPPORTUNITY_SCORE',
          category: etf.category,
          currentWeight: 0,
          targetWeight: allocation.targetWeight,
          weightGap: allocation.targetWeight,
          suggestedAmountHkd,
          blockedBy: ['LOW_OPPORTUNITY_SCORE'],
          createdAt
        } satisfies Signal
      }

      return {
        id: `starter-add:${allocation.ticker}`,
        ticker: allocation.ticker,
        action: 'ADD',
        priority: allocation.targetWeight >= 15 ? 'HIGH' : 'MEDIUM',
        reason: `No current holding. Starter allocation candidate from ${input.preset.name} preset.`,
        ruleId: 'STARTER_ALLOCATION',
        category: etf.category,
        currentWeight: 0,
        targetWeight: allocation.targetWeight,
        weightGap: allocation.targetWeight,
        suggestedAmountHkd,
        createdAt
      } satisfies Signal
    })

  const signalFeed = applyPortfolioPolicy({
    portfolio: input.portfolio,
    preset: input.preset,
    valuation,
    signals: sortSignals([...holdingSignals, ...starterSignals])
  })
  const finalSignals = signalFeed.filter(signal => signal.action !== 'HOLD')

  return {
    finalSignals,
    signalFeed,
    returnTracker,
    marketRegime,
    highPriorityCount: finalSignals.filter(signal => signal.priority === 'HIGH').length,
    blockedSignalCount: finalSignals.filter(signal => signal.blockedBy && signal.blockedBy.length > 0).length,
    portfolioValueHkd: valuation.totalValueHkd
  }
}
